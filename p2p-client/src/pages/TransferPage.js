import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import DeviceStatus from '../components/DeviceStatus';
import MessagePanel from '../components/MessagePanel';
import FileTransferPanel from '../components/FileTransferPanel';
import ConnectionStatus from '../components/ConnectionStatus';
import SignalRService from '../services/SignalRService';

const TransferPage = ({ authInfo, onLogout }) => {
  const [connectionError, setConnectionError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting', 'connected', 'reconnecting', 'error'
  // const { userId, deviceId, invitationCode } = authInfo;
  const { userId, deviceId } = authInfo;

  useEffect(() => {
    const connectToHub = async () => {
      try {
        setConnectionStatus('connecting');
        console.log('Attempting to connect to SignalR hub with userId:', userId, 'deviceId:', deviceId);
        
        // 添加连接事件处理
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
        
        await SignalRService.startConnection(userId, deviceId);
        console.log('SignalR connection established successfully');
        setConnectionStatus('connected');
        setIsConnected(true);
      } catch (error) {
        console.error('Failed to connect to SignalR hub:', error);
        setConnectionStatus('error');
        setConnectionError('Failed to connect to the P2P network. Please try again, or check browser console for details.');
      }
    };

    connectToHub();

    return () => {
      SignalRService.stopConnection();
    };
  }, [userId, deviceId]);

  const handleDisconnect = () => {
    SignalRService.stopConnection();
    onLogout();
  };

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
            onClick={() => {
              navigator.clipboard.writeText(authInfo.invitationCode);
              alert('Invitation code copied to clipboard!');
            }}
          >
            Copy Code
          </Button>
        </Alert>
      )}
      
      <ConnectionStatus isConnected={isConnected} />

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