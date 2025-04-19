import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';

const DeviceStatus = ({ authInfo }) => {
  const [onlineDevices, setOnlineDevices] = useState([]);
  const [debug, setDebug] = useState({lastReceived: 'none', counts: 0});
  
  // eslint-disable-next-line no-unused-vars
  const { userId, deviceId } = authInfo;
  
  // 添加调试功能 - 在UI中显示原始接收到的设备数据
  const addDebugInfo = (deviceList) => {
    if (deviceList && Array.isArray(deviceList)) {
      setDebug({
        lastReceived: JSON.stringify(deviceList, null, 2),
        counts: deviceList.length
      });
    }
  };

  // Define handlers with useCallback to avoid dependencies warning
  const handleOnlineDevices = useCallback((devices) => {
    console.log("Received online devices:", devices);
    
    // 保存原始设备数据用于调试
    addDebugInfo(devices);
    
    if (!devices || !Array.isArray(devices)) {
      console.warn("Invalid devices data received:", devices);
      return;
    }
    
    // 输出详细的设备对象结构
    console.log("Detailed device objects:", 
      devices.map(d => `Device ID: ${d.id || d.Id || d.deviceId || d.DeviceId}, Last Activity: ${d.lastActivity || d.LastActivity}`).join('\n')
    );
    
    // 标准化设备数据格式，确保每个设备对象具有预期的属性
    const normalizedDevices = devices.map(device => ({
      id: device.id || device.Id || device.deviceId || device.DeviceId || '', // 支持更多可能的属性名
      lastActivity: device.lastActivity || device.LastActivity || new Date(),
      isOnline: true // 如果设备在列表中，默认为在线
    }));
    
    // 确保设备ID不为空并且是唯一的
    const validDevices = normalizedDevices
      .filter(d => d.id && d.id.length > 0)
      .filter((d, index, self) => 
        self.findIndex(dd => dd.id === d.id) === index
      );
    
    console.log("Valid device list:", validDevices);
    
    // 使用最新的设备列表完全替换状态
    setOnlineDevices(validDevices);
    
    console.log("Final device count:", validDevices.length);
  }, []);

  const handleDeviceStatusChanged = useCallback((changedDeviceId, isOnline) => {
    console.log("Device status changed:", changedDeviceId, isOnline);
    
    setOnlineDevices(prev => {
      // Clone the previous devices array
      const updatedDevices = [...prev];
      
      // Find existing device
      const deviceIndex = updatedDevices.findIndex(d => d.id === changedDeviceId);
      
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
        if (changedDeviceId !== deviceId) {
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
  }, [deviceId]);

  useEffect(() => {
    // 确保当前设备总是显示在列表中
    setOnlineDevices([{
      id: deviceId,
      lastActivity: new Date(),
      isOnline: true
    }]);
    
    // Register event handlers
    SignalRService.on('OnlineDevices', handleOnlineDevices);
    SignalRService.on('DeviceStatusChanged', handleDeviceStatusChanged);
    
    console.log('DeviceStatus: Set up event handlers');
    
    // 立即请求设备列表，同时设置定时器定期刷新
    const requestDevices = () => {
      if (SignalRService.connection && 
          SignalRService.connection.state === 'Connected') {
        console.log('Requesting online devices...');
        SignalRService.connection.invoke('GetOnlineDevices')
          .catch(error => console.error('Failed to request online devices:', error));
      }
    };
    
    // 初始请求
    setTimeout(requestDevices, 1000);
    
    // 设置定期请求，每10秒刷新一次在线设备列表
    const intervalId = setInterval(requestDevices, 10000);
    
    console.log('DeviceStatus initialized with current device ID:', deviceId);

    return () => {
      // Clean up all handlers
      SignalRService.on('OnlineDevices', null);
      SignalRService.on('DeviceStatusChanged', null);
      
      // 清理定时器
      clearInterval(intervalId);
    };
  }, [deviceId, handleDeviceStatusChanged, handleOnlineDevices]);

  // eslint-disable-next-line no-unused-vars
  const formatDeviceName = (id) => {
    if (id === deviceId) {
      return 'This device';
    }
    return `Device ${id.substring(0, 8)}...`;
  };

  // 找出在线的其他设备的数量
  const allDeviceIds = onlineDevices.map(d => d.id);
  console.log("All device IDs in state:", allDeviceIds.join(', '));
  
  // 计算其他设备数量（不是当前设备的）
  const otherDevices = onlineDevices.filter(d => 
    d.isOnline !== false && d.id !== deviceId
  );
  
  console.log("Other devices:", otherDevices.map(d => d.id).join(', '));
  
  // 计算总的连接设备数量 (自己 + 其他设备)
  const connectedDevicesCount = 1 + otherDevices.length;
  
  // 添加额外调试
  console.log(`DeviceStatus rendering: ${connectedDevicesCount} devices total ` + 
    `(self + ${otherDevices.length} others)`);
    
  // 检查是否有两个设备显示的调试
  if (connectedDevicesCount === 2) {
    console.log("✅ SUCCESS: Both devices are now shown!");
  } else if (otherDevices.length === 0 && onlineDevices.length > 1) {
    console.log("🔴 ERROR: Received multiple devices but none identified as 'other'");
    console.log("Current deviceId:", deviceId);
    console.log("Received device IDs:", allDeviceIds);
  }

  // 调试渲染 - 输出所有设备详情
  console.log("DeviceStatus render - all devices:", 
    onlineDevices.map(d => `${d.id} (${d.id === deviceId ? 'self' : 'other'})`).join(', ')
  );

  return (
    <div className="mb-4">
      <h4>Device Status</h4>
      <p>Your Device ID: <span className="text-muted">{deviceId.substring(0, 8)}...</span></p>
      <p>
        Connected Devices: {onlineDevices.length}/2
      </p>
      
      <div>
        {/* 显示所有设备，根据ID判断是否为本机 */}
        {onlineDevices.map(device => (
          <div key={device.id} className="mb-2">
            <Badge bg="success" className="me-2">Online</Badge>
            {device.id === deviceId ? 'This device' : `Device ${device.id.substring(0, 8)}...`}
          </div>
        ))}
      </div>
      
      {/* 调试信息 - 不影响正常用户体验的隐藏面板 */}
      <div style={{display: 'none'}}>
        <hr />
        <h6>Debug Info (Raw devices: {debug.counts})</h6>
        <pre style={{fontSize: '10px', maxHeight: '200px', overflow: 'auto'}}>
          {debug.lastReceived}
        </pre>
      </div>
    </div>
  );
};

export default DeviceStatus;