import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Badge, Button } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';

const DeviceStatus = ({ authInfo }) => {
  const [onlineDevices, setOnlineDevices] = useState([]);
  const [debug, setDebug] = useState({lastReceived: 'none', counts: 0});
  const [retryCount, setRetryCount] = useState(0);
  const deviceRequestTimer = useRef(null);
  const maxRetries = 5; // Maximum number of retries for device list requests
  
  const { userId, deviceId } = authInfo;
  
  // Add debug functionality - display raw received device data in UI
  const addDebugInfo = (deviceList) => {
    if (deviceList && Array.isArray(deviceList)) {
      setDebug({
        lastReceived: JSON.stringify(deviceList, null, 2),
        counts: deviceList.length
      });
    }
  };

  // Function to request device list that can be called from multiple places
  // Define this before other callbacks that depend on it
  const requestDeviceList = useCallback(() => {
    if (SignalRService.connection && 
        SignalRService.connection.state === 'Connected') {
      console.log('Requesting online devices... (attempt #' + (retryCount + 1) + ')');
      
      // More aggressive approach: Request devices from server AND check local storage
      SignalRService.connection.invoke('GetOnlineDevices')
        .catch(error => console.error('Failed to request online devices:', error));
    } else {
      console.log('SignalR not connected, cannot request devices');
    }
  }, [retryCount]);

  // Define handlers with useCallback to avoid dependencies warning
  const handleOnlineDevices = useCallback((devices) => {
    console.log("Received online devices:", devices);
    
    // Save raw device data for debugging
    addDebugInfo(devices);
    
    if (!devices || !Array.isArray(devices)) {
      console.warn("Invalid devices data received:", devices);
      return;
    }
    
    // Enhanced logging: print complete device information
    console.log("Detailed device objects:");
    devices.forEach((device, index) => {
      console.log(`Device ${index + 1}:`, device);
    });
    
    // Normalize device data format, flexibly extract device IDs
    const normalizedDevices = devices.map(device => {
      // Try various possible ID property names
      const deviceId = device.id || device.Id || device.deviceId || device.DeviceId || '';
      console.log(`Device ID normalization: Original=${JSON.stringify(device)}, Extracted ID=${deviceId}`);
      
      return {
        id: deviceId,
        lastActivity: device.lastActivity || device.LastActivity || new Date(),
        isOnline: true // If the device is in the list, default to online
      };
    });
    
    // Ensure device IDs are not empty and unique
    const validDevices = normalizedDevices
      .filter(d => d.id && d.id.length > 0)
      .filter((d, index, self) => 
        self.findIndex(dd => dd.id === d.id) === index
      );
    
    console.log("Valid device list:", validDevices);
    
    // Record the retry count
    if (validDevices.length < 2 && retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
    } else if (validDevices.length >= 2) {
      // Reset retry count when we have at least 2 devices
      setRetryCount(0);
    }
    
    // Use the latest device list to completely replace the state
    setOnlineDevices(validDevices);
    
    console.log("Final device count:", validDevices.length);
  }, [retryCount]);

  const handleDeviceStatusChanged = useCallback((changedDeviceId, isOnline) => {
    console.log("Device status changed:", changedDeviceId, isOnline);
    console.log("Current device ID:", deviceId);
    console.log("Changed device ID:", changedDeviceId);
    
    // Always request the full device list when a device status changes
    requestDeviceList();
    
    setOnlineDevices(prev => {
      // Clone the previous devices array
      const updatedDevices = [...prev];
      
      // Find existing device - more flexibly compare device IDs (case-insensitive)
      const deviceIndex = updatedDevices.findIndex(d => 
        d.id.toLowerCase() === changedDeviceId.toLowerCase()
      );
      
      if (isOnline) {
        // If the device is online and not in the list, add it
        if (deviceIndex === -1) {
          updatedDevices.push({ 
            id: changedDeviceId, 
            lastActivity: new Date(), 
            isOnline: true 
          });
        } else {
          // Update existing device
          updatedDevices[deviceIndex] = {
            ...updatedDevices[deviceIndex],
            isOnline: true,
            lastActivity: new Date()
          };
        }
      } else if (deviceIndex !== -1) {
        // If device is going offline and it's not the current device, remove it
        if (changedDeviceId.toLowerCase() !== deviceId.toLowerCase()) {
          updatedDevices.splice(deviceIndex, 1);
        } else {
          // Just mark current device as offline but keep it
          updatedDevices[deviceIndex] = {
            ...updatedDevices[deviceIndex],
            isOnline: false
          };
        }
      }
      
      console.log("Updated devices after status change:", updatedDevices);
      return updatedDevices;
    });
  }, [deviceId, requestDeviceList]); // Added requestDeviceList to dependency array

  // Add manual refresh option for user
  const handleManualRefresh = useCallback(() => {
    console.log("Manual refresh requested");
    requestDeviceList();
  }, [requestDeviceList]);

  // Add a function to combine devices from multiple sources
  const combineDeviceList = useCallback(() => {
    console.log("Combining device lists from multiple sources");
    
    // Try to get a more complete device list by checking local storage
    // and any other sources available
    try {
      const storedDeviceList = localStorage.getItem('device_list_' + userId);
      if (storedDeviceList) {
        const parsedList = JSON.parse(storedDeviceList);
        console.log("Found stored device list:", parsedList);
        handleOnlineDevices(parsedList);
      }
    } catch (error) {
      console.error("Error checking stored device list:", error);
    }
    
    // Always request a fresh list from server
    requestDeviceList();
  }, [userId, handleOnlineDevices, requestDeviceList]);

  useEffect(() => {
    // Ensure the current device is always shown in the list
    setOnlineDevices([{
      id: deviceId,
      lastActivity: new Date(),
      isOnline: true
    }]);
    
    // Register event handlers
    SignalRService.on('OnlineDevices', handleOnlineDevices);
    SignalRService.on('DeviceStatusChanged', handleDeviceStatusChanged);
    
    console.log('DeviceStatus: Set up event handlers');
    console.log('Current device ID:', deviceId);
    
    // Immediately request device list
    setTimeout(() => {
      combineDeviceList();
    }, 1000);
    
    // Set up periodic requests with exponential backoff for new sessions
    const scheduleNextRequest = () => {
      // Clear any existing timer
      if (deviceRequestTimer.current) {
        clearTimeout(deviceRequestTimer.current);
      }
      
      // Calculate delay - more frequent initially, then back off
      const delay = retryCount < 3 ? 3000 : // Every 3 seconds for first 3 attempts
                   retryCount < 5 ? 5000 : // Every 5 seconds for next 2 attempts
                   10000; // Every 10 seconds after that
      
      deviceRequestTimer.current = setTimeout(() => {
        requestDeviceList();
        // Schedule next request
        scheduleNextRequest();
      }, delay);
    };
    
    // Start the request schedule
    scheduleNextRequest();
    
    console.log('DeviceStatus initialized with current device ID:', deviceId);

    return () => {
      // Clean up all handlers
      SignalRService.on('OnlineDevices', null);
      SignalRService.on('DeviceStatusChanged', null);
      
      // Clean up timer
      if (deviceRequestTimer.current) {
        clearTimeout(deviceRequestTimer.current);
      }
    };
  }, [deviceId, userId, handleDeviceStatusChanged, handleOnlineDevices, combineDeviceList, requestDeviceList, retryCount]);

  // Update local storage when our device list changes
  useEffect(() => {
    try {
      if (onlineDevices.length > 0) {
        localStorage.setItem('device_list_' + userId, JSON.stringify(onlineDevices));
      }
    } catch (error) {
      console.error("Error storing device list:", error);
    }
  }, [onlineDevices, userId]);

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h4>Device Status</h4>
        <Button 
          variant="outline-secondary" 
          size="sm" 
          onClick={handleManualRefresh}
          aria-label="Refresh devices list"
        >
          <span aria-hidden="true">⟳</span> Refresh
        </Button>
      </div>
      <p>Your Device ID: <span className="text-muted">{deviceId.substring(0, 8)}...</span></p>
      <p>
        Connected Devices: {onlineDevices.length}/2
      </p>
      
      <div>
        {/* Display current device and other devices */}
        {onlineDevices.map(device => (
          <div key={device.id} className="mb-2">
            <Badge bg="success" className="me-2">Online</Badge>
            {device.id.toLowerCase() === deviceId.toLowerCase() ? 'This device' : `Device ${device.id.substring(0, 8)}...`}
          </div>
        ))}
      </div>
      
      {/* Debug panel - can be hidden by changing display to 'none' */}
      <div style={{display: 'none', marginTop: '20px', padding: '10px', border: '1px dashed #ccc'}}>
        <h6>Debug Info</h6>
        <p>Raw devices count: {debug.counts}</p>
        <p>Processed devices count: {onlineDevices.length}</p>
        <p>Current device ID: {deviceId}</p>
        <p>Retry count: {retryCount}/{maxRetries}</p>
        <pre style={{fontSize: '10px', maxHeight: '150px', overflow: 'auto', background: '#f5f5f5', padding: '5px'}}>
          {debug.lastReceived}
        </pre>
      </div>
    </div>
  );
};

export default DeviceStatus;