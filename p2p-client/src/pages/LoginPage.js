import React, { useState } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert } from 'react-bootstrap';
import AuthService from '../services/AuthService';

const LoginPage = ({ onLogin }) => {
  const [invitationCode, setInvitationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateCode = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const response = await AuthService.generateInvitationCode();
      setGeneratedCode(response.invitationCode);
      setShowGeneratedCode(true);
      
      console.log('Generated invitation code:', response.invitationCode);
      
      // 短暂延迟后自动登录，确保后端有足够时间处理
      setTimeout(async () => {
        try {
          console.log('Auto-login with generated code:', response.invitationCode);
          const authResponse = await AuthService.authenticateWithCode(response.invitationCode);
          if (authResponse.success) {
            console.log('Auto-login successful:', authResponse);
            // 将邀请码添加到认证响应中，以便在传输页面显示
            authResponse.invitationCode = response.invitationCode;
            onLogin(authResponse);
          } else {
            console.error('Auto-login failed:', authResponse);
            setErrorMessage(authResponse.message || 'Auto-login failed');
          }
        } catch (autoLoginError) {
          console.error('Auto-login error:', autoLoginError);
          setErrorMessage(autoLoginError.message || 'Auto-login failed');
          setIsLoading(false);
        }
      }, 500); // 500ms延迟
    } catch (error) {
      console.error('Generate code error:', error);
      setErrorMessage(error.message || 'Failed to generate invitation code');
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!invitationCode.trim()) {
      setErrorMessage('Please enter an invitation code');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage('');
      const response = await AuthService.authenticateWithCode(invitationCode);
      if (response.success) {
        // 将邀请码添加到响应中
        response.invitationCode = invitationCode.trim();
        onLogin(response);
      }
    } catch (error) {
      setErrorMessage(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container className="mt-5">
      <h1 className="text-center mb-4">P2P File Transfer</h1>
      
      {errorMessage && (
        <Alert variant="danger" onClose={() => setErrorMessage('')} dismissible>
          {errorMessage}
        </Alert>
      )}
      
      <Row>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Header>Generate Invitation Code</Card.Header>
            <Card.Body>
              <Button 
                variant="primary" 
                onClick={handleGenerateCode} 
                disabled={isLoading}
              >
                {isLoading ? 'Generating...' : 'Generate New Code'}
              </Button>
              
              {showGeneratedCode && (
                <div className="mt-3">
                  <Alert variant="success">
                    <p>Your invitation code: <strong>{generatedCode}</strong></p>
                    <p className="small mb-0">Share this code to connect another device.</p>
                  </Alert>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={6} className="mb-4">
          <Card>
            <Card.Header>Use Invitation Code</Card.Header>
            <Card.Body>
              <Form onSubmit={handleLogin}>
                <Form.Group className="mb-3">
                  <Form.Label>Enter Invitation Code</Form.Label>
                  <Form.Control
                    type="text"
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value)}
                    placeholder="XXXXXXXX"
                    disabled={isLoading}
                  />
                </Form.Group>
                <Button 
                  variant="primary" 
                  type="submit" 
                  disabled={isLoading}
                >
                  {isLoading ? 'Connecting...' : 'Connect'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default LoginPage;