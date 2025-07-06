import React, { useState, useEffect } from 'react';

const LoginForm = ({ onLoginSuccess, showToast, loading, setLoading }) => {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpSection, setShowOtpSection] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [mobileDisabled, setMobileDisabled] = useState(false);

  useEffect(() => {
    let interval;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  const handleSendOtp = async () => {
    if (!/^\d{10}$/.test(mobile)) {
      alert('Enter valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile })
      });

      const data = await response.text();
      showToast(data);

      if (data.includes('OTP generated successfully')) {
        setShowOtpSection(true);
        setMobileDisabled(true);
        setOtpTimer(60);
        setTimeout(() => document.getElementById('otp-input')?.focus(), 100);
      }
    } catch (error) {
      showToast('Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      alert('Enter OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, otp })
      });

      const data = await response.text();
      showToast(data);

      if (data.includes('Logged in successfully') || data.includes('successfully')) {
        onLoginSuccess();
      }
    } catch (error) {
      showToast('Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e) => {
    const value = e.target.value;
    setOtp(value);
    if (value.length === 4) {
      setTimeout(handleVerifyOtp, 100);
    }
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  return (
    <div className="container">
      <h2>Login with OTP</h2>
      
      <div className="login-form">
        <input
          type="text"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="Enter Mobile Number"
          maxLength="10"
          disabled={mobileDisabled}
          onKeyDown={(e) => handleKeyPress(e, handleSendOtp)}
        />
        
        <button 
          onClick={handleSendOtp}
          disabled={loading || (otpTimer > 0)}
        >
          {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Send OTP'}
        </button>

        {showOtpSection && (
          <div className="otp-section">
            <input
              id="otp-input"
              type="text"
              value={otp}
              onChange={handleOtpChange}
              placeholder="Enter OTP"
              maxLength="4"
              onKeyDown={(e) => handleKeyPress(e, handleVerifyOtp)}
            />
            <button onClick={handleVerifyOtp} disabled={loading}>
              Verify OTP
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="spinner">
          🔄 Loading...
        </div>
      )}
    </div>
  );
};

export default LoginForm;