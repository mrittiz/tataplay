import React from 'react';

const Toast = ({ message, show }) => {
  return (
    <div className={`toast ${show ? 'show' : ''}`}>
      {message}
    </div>
  );
};

export default Toast;