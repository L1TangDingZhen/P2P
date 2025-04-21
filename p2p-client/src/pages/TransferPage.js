import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import DeviceStatus from '../components/DeviceStatus';
import MessagePanel from '../components/MessagePanel';
import FileTransferPanel from '../components/FileTransferPanel';
import ConnectionStatus from '../components/ConnectionStatus';
import SignalRService from '../services/SignalRService';
import WebRTCService from '../services/WebRTCService';
import * as signalR from '@microsoft/signalr';

const TransferPage = ({ authInfo, onLogout }) => {
  const [connectionError, setConnectionError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting', 'connected', 'reconnecting', 'error'
  const [transferMode, setTransferMode] = useState('server'); // 'server' or 'p2p'
  const { userId, deviceId } = authInfo;

  // Define disconnect handler first to avoid dependency cycle
  const handleDisconnect = useCallback(() => {
    console.log('Disconnecting WebRTC and SignalR connections');
    WebRTCService.closeAllConnections();
    SignalRService.stopConnection();
    onLogout();
  }, [onLogout]);

  useEffect(() => {
    const connectToHub = async () => {
      try {
        setConnectionStatus('connecting');
        console.log('Attempting to connect to SignalR hub with userId:', userId, 'deviceId:', deviceId);
        
        // Add connection event handlers
        SignalRService.on('onConnectionEstablished', () => {
          setConnectionStatus('connected');
          setIsConnected(true);
        });
        
        SignalRService.on('onConnectionClosed', (error) => {
          console.log('Connection closed event received', error);
          if (error) {
            setConnectionStatus('error');
            setConnectionError('Connection lost. Please refresh the page to reconnect.');
          } else {
            setConnectionStatus('reconnecting');
          }
          setIsConnected(false);
        });
        
        // Set event handlers before starting connection
        // Add callback for online devices
        SignalRService.on('OnlineDevices', (devices) => {
          console.log('TransferPage: online devices received:', devices);
        });
        
        SignalRService.on('DeviceStatusChanged', (deviceId, isOnline) => {
          console.log('TransferPage: device status changed:', deviceId, isOnline);
        });
        
        // Setup window beforeunload event to try to cleanly disconnect
        window.addEventListener('beforeunload', handleDisconnect);
        
        await SignalRService.startConnection(userId, deviceId);
        console.log('SignalR connection established successfully');
        setConnectionStatus('connected');
        setIsConnected(true);
        
        // Initialize WebRTC service
        try {
          await WebRTCService.initialize(userId, deviceId);
          
          // Listen for transfer mode changes
          WebRTCService.on('onTransferModeChanged', (mode) => {
            console.log(`Transfer mode changed to: ${mode}`);
            setTransferMode(mode);
          });
          
          WebRTCService.on('onConnectionStateChanged', (peerId, state) => {
            console.log(`WebRTC connection to ${peerId} changed to ${state}`);
          });
          
          console.log('WebRTC service initialized successfully');
          
          // Manually check for online devices after 1 second, in case we missed initial events
          setTimeout(() => {
            const status = WebRTCService.getConnectionStatus();
            console.log('Current WebRTC connection status:', status);
          }, 1000);
        } catch (webrtcError) {
          console.error('Failed to initialize WebRTC:', webrtcError);
          // Even if WebRTC fails, we can still use server relay
        }
      } catch (error) {
        console.error('Failed to connect to SignalR hub:', error);
        setConnectionStatus('error');
        setConnectionError('Failed to connect to the P2P network. Please try again, or check browser console for details.');
      }
    };

    connectToHub();

    return () => {
      // Clean up event listener
      window.removeEventListener('beforeunload', handleDisconnect);
      
      // Clean up connections
      WebRTCService.closeAllConnections();
      SignalRService.stopConnection();
    };
  }, [userId, deviceId, handleDisconnect]);

  // 检查连接状态
  useEffect(() => {
    if (isConnected) {
      // 每10秒更新一次传输模式和检查连接状态
      const interval = setInterval(() => {
        // 更新传输模式
        const status = WebRTCService.getConnectionStatus();
        if (status.transferMode !== transferMode) {
          setTransferMode(status.transferMode);
        }
        
        // 检查 SignalR 连接状态，如果断开尝试重连
        if (SignalRService.connection && 
            SignalRService.connection.state !== signalR.HubConnectionState.Connected) {
          console.log('Detected disconnected state, updating UI');
          setIsConnected(false);
          setConnectionStatus('reconnecting');
        }
      }, 10000);
      
      return () => clearInterval(interval);
    }
  }, [isConnected, transferMode]);

  if (connectionError) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">
          {connectionError}
          <div className="mt-3">
            <Button variant="outline-danger" onClick={onLogout}>
              Disconnect
            </Button>
          </div>
        </Alert>
      </Container>
    );
  }

  if (!isConnected) {
    return (
      <Container className="mt-5 text-center">
        {connectionStatus === 'connecting' && (
          <>
            <Spinner animation="border" role="status" variant="primary" />
            <p className="mt-2">Connecting to P2P network...</p>
          </>
        )}
        
        {connectionStatus === 'reconnecting' && (
          <>
            <Spinner animation="border" role="status" variant="warning" />
            <p className="mt-2">Reconnecting to P2P network...</p>
            <p className="text-muted small">This may take a few moments.</p>
          </>
        )}
        
        {connectionStatus === 'error' && (
          <div className="text-center">
            <div className="mb-3">
              <i className="bi bi-exclamation-triangle text-danger" style={{ fontSize: '3rem' }}></i>
            </div>
            <p className="text-danger">{connectionError}</p>
            <Button 
              variant="primary" 
              onClick={() => window.location.reload()}
              className="mt-3"
            >
              Refresh Page
            </Button>
          </div>
        )}
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h1>P2P File Transfer</h1>
        <Button variant="outline-danger" onClick={handleDisconnect}>
          Disconnect
        </Button>
      </div>
      
      {authInfo.invitationCode && (
        <Alert variant="info" className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <strong>Invitation Code:</strong> {authInfo.invitationCode}
            <p className="small mb-0 text-muted">Share this code to connect another device</p>
          </div>
          <Button 
            variant="outline-primary" 
            size="sm"
            className="copy-button"
            onClick={(e) => {
              navigator.clipboard.writeText(authInfo.invitationCode);
              
              // 添加点击动画效果
              const button = e.currentTarget;
              button.classList.add('clicked');
              
              // 300ms后移除动画类
              setTimeout(() => {
                button.classList.remove('clicked');
              }, 300);
            }}
          >
            Copy Code
          </Button>
        </Alert>
      )}
      
      <ConnectionStatus isConnected={isConnected} transferMode={transferMode} />

      <Row>
        <Col md={4}>
          <DeviceStatus authInfo={authInfo} />
        </Col>
        <Col md={8}>
          <MessagePanel userId={userId} deviceId={deviceId} />
          <hr className="my-4" />
          <FileTransferPanel userId={userId} deviceId={deviceId} />
        </Col>
      </Row>
    </Container>
  );
};

export default TransferPage;