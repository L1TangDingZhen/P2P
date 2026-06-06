import React, { useState } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert } from 'react-bootstrap';
import AuthService from '../services/AuthService';

// 把后端/网络原始错误转成用户能看懂的提示
const friendlyError = (error) => {
  const msg = (error && error.message) ? error.message : '';
  const low = msg.toLowerCase();

  if (low.includes('failed to fetch') || low.includes('networkerror') || low.includes('network error')) {
    return 'Network error. Please check your connection and try again.';
  }
  if (msg.includes('404') || low.includes('not found')) {
    return 'Invitation code not found or already used.';
  }
  if (msg.includes('400') || low.includes('invalid invitation code')) {
    return 'Invalid invitation code. Please double-check and try again.';
  }
  if (low.includes('maximum number of devices')) {
    return 'This code is already in use by the maximum number of devices.';
  }
  if (msg.includes('500') || low.includes('internal server')) {
    return 'Server error. Please try again in a moment.';
  }
  if (low.includes('authentication failed')) {
    return 'Authentication failed. Please try again.';
  }
  return 'Connection failed. Please try again.';
};

const LoginPage = ({ onLogin }) => {
  const [invitationCode, setInvitationCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  // 错误分两类:
  //  - codeError: 邀请码输入框相关错误，inline 显示在输入框下方
  //  - globalError: 全局/系统错误（生成码失败、网络异常），顶部 alert 显示
  const [codeError, setCodeError] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateCode = async () => {
    try {
      setIsLoading(true);
      setGlobalError('');
      setCodeError('');
      const response = await AuthService.generateInvitationCode();
      setGeneratedCode(response.invitationCode);
      setShowGeneratedCode(true);

      console.log('Generated invitation code:', response.invitationCode);

      // 短暂延迟后自动登录
      setTimeout(async () => {
        try {
          console.log('Auto-login with generated code:', response.invitationCode);
          const authResponse = await AuthService.authenticateWithCode(response.invitationCode);
          if (authResponse.success) {
            authResponse.invitationCode = response.invitationCode;
            onLogin(authResponse);
          } else {
            console.error('Auto-login failed:', authResponse);
            setGlobalError('Failed to log in with the generated code. Please try again.');
            setIsLoading(false);
          }
        } catch (autoLoginError) {
          console.error('Auto-login error:', autoLoginError);
          setGlobalError(friendlyError(autoLoginError));
          setIsLoading(false);
        }
      }, 500);
    } catch (error) {
      console.error('Generate code error:', error);
      setGlobalError(friendlyError(error));
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!invitationCode.trim()) {
      setCodeError('Please enter an invitation code.');
      return;
    }

    try {
      setIsLoading(true);
      setCodeError('');
      setGlobalError('');
      const response = await AuthService.authenticateWithCode(invitationCode);
      if (response.success) {
        response.invitationCode = invitationCode.trim();
        onLogin(response);
      } else {
        setCodeError('Authentication failed. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      // 网络/服务器层面的失败 → 全局错误
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('failed to fetch') || msg.includes('500') || msg.includes('network')) {
        setGlobalError(friendlyError(error));
      } else {
        // 邀请码相关失败 → 输入框下方
        setCodeError(friendlyError(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container className="mt-5">
      <h1 className="text-center mb-4">P2P File Transfer</h1>

      {globalError && (
        <Alert variant="danger" onClose={() => setGlobalError('')} dismissible>
          {globalError}
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
              <Form onSubmit={handleLogin} noValidate>
                <Form.Group className="mb-3">
                  <Form.Label>Enter Invitation Code</Form.Label>
                  <Form.Control
                    type="text"
                    value={invitationCode}
                    onChange={(e) => {
                      setInvitationCode(e.target.value);
                      if (codeError) setCodeError('');
                    }}
                    placeholder="XXXXXXXX"
                    disabled={isLoading}
                    isInvalid={!!codeError}
                  />
                  <Form.Control.Feedback type="invalid">
                    {codeError}
                  </Form.Control.Feedback>
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
