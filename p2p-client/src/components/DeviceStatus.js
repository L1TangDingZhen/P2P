import React, { useState, useEffect } from 'react';
import { Badge } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';

const DeviceStatus = ({ authInfo }) => {
  const [onlineDevices, setOnlineDevices] = useState([]);
  const { deviceId } = authInfo; // 删除未使用的userId变量

  useEffect(() => {
    // Register event handlers
    SignalRService.on('onOnlineDevices', handleOnlineDevices);
    SignalRService.on('onDeviceStatusChanged', handleDeviceStatusChanged);

    return () => {
      // Clean up
      SignalRService.on('onOnlineDevices', null);
      SignalRService.on('onDeviceStatusChanged', null);
    };
  }, []);

  const handleOnlineDevices = (devices) => {
    setOnlineDevices(devices);
  };

  const handleDeviceStatusChanged = (changedDeviceId, isOnline) => {
    setOnlineDevices(prev => {
      // If device is coming online and not in list, add it
      if (isOnline && !prev.find(d => d.id === changedDeviceId)) {
        return [...prev, { id: changedDeviceId, lastActivity: new Date() }];
      }
      
      // If device is going offline, remove it or update status
      return prev.map(d => 
        d.id === changedDeviceId ? { ...d, isOnline } : d
      ).filter(d => d.isOnline !== false);
    });
  };

  const formatDeviceName = (id) => {
    if (id === deviceId) {
      return 'This device';
    }
    return `Device ${id.substring(0, 8)}...`;
  };

  return (
    <div className="mb-4">
      <h4>Device Status</h4>
      <p>Your Device ID: <span className="text-muted">{deviceId.substring(0, 8)}...</span></p>
      <p>
        Connected Devices: {onlineDevices.length}/2
      </p>
      
      <div>
        {onlineDevices.map(device => (
          <div key={device.id} className="mb-2">
            <Badge bg="success" className="me-2">Online</Badge>
            {formatDeviceName(device.id)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceStatus;