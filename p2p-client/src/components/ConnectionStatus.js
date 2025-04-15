import React, { useState, useEffect } from 'react';
import { Badge } from 'react-bootstrap';

const ConnectionStatus = ({ isConnected }) => {
  const [serverStatus, setServerStatus] = useState('unknown');
  const [lastChecked, setLastChecked] = useState(null);

  // 检查服务器状态
  const checkServerStatus = async () => {
    try {
      // 使用当前网页的主机名构建API URL
      const currentHost = window.location.hostname;
      // 如果是本地主机，使用localhost:5235，否则使用当前主机名配合5235端口
      const apiUrl = currentHost === 'localhost' ? 
        'http://localhost:5235' : 
        `http://${currentHost}:5235`;
        
      console.log(`Health check URL: ${apiUrl}/api/connectionstatus/health`);
      
      const response = await fetch(`${apiUrl}/api/connectionstatus/health`, {
        credentials: 'include',
        mode: 'cors'
      });
      if (response.ok) {
        await response.json(); // 消费响应体但不保存变量
        setServerStatus('online');
        setLastChecked(new Date());
        return true;
      } else {
        setServerStatus('offline');
        setLastChecked(new Date());
        return false;
      }
    } catch (error) {
      console.error('Server health check failed:', error);
      setServerStatus('offline');
      setLastChecked(new Date());
      return false;
    }
  };

  useEffect(() => {
    // 初始检查
    checkServerStatus();
    
    // 每60秒检查一次
    const interval = setInterval(() => {
      checkServerStatus();
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-2 mb-3 d-flex align-items-center">
      <div>
        <span>Server: </span>
        {serverStatus === 'online' ? (
          <Badge bg="success">Online</Badge>
        ) : serverStatus === 'offline' ? (
          <Badge bg="danger">Offline</Badge>
        ) : (
          <Badge bg="secondary">Checking...</Badge>
        )}
      </div>
      
      <div className="ms-3">
        <span>Connection: </span>
        {isConnected ? (
          <Badge bg="success">Connected</Badge>
        ) : (
          <Badge bg="warning">Disconnected</Badge>
        )}
      </div>
      
      {lastChecked && (
        <div className="ms-auto text-muted small">
          Last checked: {lastChecked.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;