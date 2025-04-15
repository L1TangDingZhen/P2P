import React, { useState, useRef, useEffect } from 'react';
import { Form, InputGroup, Button } from 'react-bootstrap';
import SignalRService from '../services/SignalRService';

const MessagePanel = ({ userId, deviceId }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const messageAreaRef = useRef(null);

  useEffect(() => {
    // Register event handler for receiving messages
    SignalRService.on('onReceiveMessage', handleReceiveMessage);

    return () => {
      // Clean up the event handler
      SignalRService.on('onReceiveMessage', null);
    };
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messageAreaRef.current) {
      messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleReceiveMessage = (message) => {
    // 检查消息是否已经存在（防止重复）
    setMessages(prevMessages => {
      // 使用内容和时间戳作为检查重复的条件
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
        isReceived: true
      }];
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!message.trim()) return;

    try {
      await SignalRService.sendMessage(userId, deviceId, message);
      
      // Add the sent message to the messages list
      setMessages(prevMessages => [...prevMessages, {
        content: message,
        senderDeviceId: deviceId,
        timestamp: new Date(),
        isReceived: false
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
      <h4>Messages</h4>
      
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
              <div className="text-end small mt-1">
                {formatTimestamp(msg.timestamp)}
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