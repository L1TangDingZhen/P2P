import React, { useState, useRef, useEffect } from 'react';
import { Form, InputGroup, Button, Badge } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';
import WebRTCService from '../services/WebRTCService';

const MessagePanel = ({ userId, deviceId }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [transferMode, setTransferMode] = useState('server'); // 'server' or 'p2p'
  const messageAreaRef = useRef(null);

  useEffect(() => {
    // Get current WebRTC connection status and update transfer type
    const updateTransferMode = () => {
      try {
        const connectionStatus = WebRTCService.getConnectionStatus();
        if (connectionStatus.transferMode !== transferMode) {
          setTransferMode(connectionStatus.transferMode);
          console.log(`Message transfer mode updated to: ${connectionStatus.transferMode}`);
        }
      } catch (error) {
        console.error('Error getting WebRTC status:', error);
      }
    };

    // Listen for WebRTC transfer mode changes
    WebRTCService.on('onTransferModeChanged', (mode) => {
      setTransferMode(mode);
      console.log(`Message transfer mode changed to: ${mode}`);
    });

    // Register event handler for receiving messages
    SignalRService.on('onReceiveMessage', handleReceiveMessage);
    
    // Add WebRTC message reception handler
    WebRTCService.on('onMessageReceived', handleWebRTCMessage);

    // Initial transfer type retrieval
    updateTransferMode();
    
    // Periodically update transfer type
    const interval = setInterval(updateTransferMode, 5000);

    return () => {
      // Clean up the event handlers
      SignalRService.on('onReceiveMessage', null);
      WebRTCService.on('onMessageReceived', null);
      WebRTCService.on('onTransferModeChanged', null);
      clearInterval(interval);
    };
  }, [transferMode]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messageAreaRef.current) {
      messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleReceiveMessage = (message) => {
    // Check if message already exists (to prevent duplicates)
    setMessages(prevMessages => {
      // Use content and timestamp as conditions to check for duplicates
      const isDuplicate = prevMessages.some(
        m => m.content === message.content && 
             Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 1000
      );
      
      if (isDuplicate) {
        console.log('Duplicate message detected, not adding to UI', message);
        return prevMessages;
      }
      
      return [...prevMessages, {
        ...message,
        isReceived: true,
        transferType: 'server' // Mark as server relay
      }];
    });
  };

  // WebRTC message handler function
  const handleWebRTCMessage = (message) => {
    setMessages(prevMessages => {
      // Use content and timestamp as conditions to check for duplicates
      const isDuplicate = prevMessages.some(
        m => m.content === message.content && 
             Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 1000
      );
      
      if (isDuplicate) {
        console.log('Duplicate WebRTC message detected, not adding to UI', message);
        return prevMessages;
      }
      
      return [...prevMessages, {
        ...message,
        isReceived: true,
        transferType: 'p2p' // Mark as P2P direct
      }];
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!message.trim()) return;

    try {
      // Record the transfer mode used for sending the message
      const currentMode = transferMode;
      
      // If in P2P mode, try to send using WebRTC
      let sentViaP2P = false;
      if (currentMode === 'p2p') {
        try {
          console.log('Attempting to send message via WebRTC P2P');
          // This part should actually implement WebRTC message sending
          // For now, for demonstration, we just log and use server relay
          console.log('WebRTC P2P message transfer not fully implemented, using server relay');
        } catch (p2pError) {
          console.error('WebRTC message sending failed, using server relay:', p2pError);
        }
      }
      
      // If not sent via P2P, use SignalR server relay
      if (!sentViaP2P) {
        await SignalRService.sendMessage(userId, deviceId, message);
      }
      
      // Add the sent message to the messages list
      setMessages(prevMessages => [...prevMessages, {
        content: message,
        senderDeviceId: deviceId,
        timestamp: new Date(),
        isReceived: false,
        transferType: sentViaP2P ? 'p2p' : 'server' // Mark according to actual sending method
      }]);
      
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>Messages</h4>
      </div>
      
      <div 
        ref={messageAreaRef}
        className="border rounded p-3 mb-3" 
        style={{ height: '300px', overflowY: 'auto' }}
      >
        {messages.length === 0 ? (
          <p className="text-muted text-center my-5">No messages yet</p>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={index} 
              className={`mb-2 p-2 rounded ${msg.isReceived ? 'bg-light' : 'bg-primary text-white'}`}
              style={{ 
                maxWidth: '80%', 
                marginLeft: msg.isReceived ? '0' : 'auto', 
                marginRight: msg.isReceived ? 'auto' : '0'
              }}
            >
              <div>{msg.content}</div>
              <div className="d-flex justify-content-end align-items-center small mt-1">
                <span>{formatTimestamp(msg.timestamp)}</span>
              </div>
            </div>
          ))
        )}
      </div>
      
      <Form onSubmit={handleSendMessage}>
        <InputGroup>
          <Form.Control
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
          />
          <Button type="submit" variant="primary">Send</Button>
        </InputGroup>
      </Form>
    </div>
  );
};

export default MessagePanel;