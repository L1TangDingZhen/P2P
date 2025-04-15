import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

import LoginPage from './pages/LoginPage';
import TransferPage from './pages/TransferPage';
import AuthService from './services/AuthService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authInfo, setAuthInfo] = useState(null);

  useEffect(() => {
    const checkAuth = () => {
      const userInfo = AuthService.getCurrentUser();
      if (userInfo) {
        setIsAuthenticated(true);
        setAuthInfo(userInfo);
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogin = (userInfo) => {
    AuthService.setCurrentUser(userInfo);
    setIsAuthenticated(true);
    setAuthInfo(userInfo);
  };

  const handleLogout = () => {
    AuthService.logout();
    setIsAuthenticated(false);
    setAuthInfo(null);
  };

  if (loading) {
    return <div className="container mt-5 text-center">Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? 
            <Navigate to="/transfer" /> : 
            <LoginPage onLogin={handleLogin} />
          } 
        />
        <Route 
          path="/transfer" 
          element={
            isAuthenticated ? 
            <TransferPage authInfo={authInfo} onLogout={handleLogout} /> : 
            <Navigate to="/" />
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;