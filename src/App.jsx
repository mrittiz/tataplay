import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import SplashScreen from './components/SplashScreen';
import Toast from './components/Toast';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', show: false });

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const response = await fetch('/api/auth/check-login');
      const data = await response.json();
      setIsLoggedIn(data.exists);
    } catch (error) {
      console.error('Failed to check login status:', error);
    }
  };

  const showToast = (message) => {
    setToast({ message, show: true });
    setTimeout(() => {
      setToast({ message: '', show: false });
    }, 3000);
  };

  const handleSplashEnd = () => {
    setShowSplash(false);
  };

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    showToast('Logged in successfully');
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await response.text();
      showToast(data);
      setIsLoggedIn(false);
    } catch (error) {
      showToast('Failed to logout');
    } finally {
      setLoading(false);
    }
  };

  if (showSplash) {
    return <SplashScreen onEnd={handleSplashEnd} />;
  }

  return (
    <div className="app">
      {isLoggedIn ? (
        <Dashboard onLogout={handleLogout} loading={loading} />
      ) : (
        <LoginForm 
          onLoginSuccess={handleLoginSuccess} 
          showToast={showToast}
          loading={loading}
          setLoading={setLoading}
        />
      )}
      <Toast message={toast.message} show={toast.show} />
    </div>
  );
}

export default App;