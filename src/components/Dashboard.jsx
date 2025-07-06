import React, { useState, useEffect } from 'react';

const Dashboard = ({ onLogout, loading }) => {
  const [playlistUrl, setPlaylistUrl] = useState('');

  useEffect(() => {
    const baseUrl = window.location.origin;
    setPlaylistUrl(`${baseUrl}/api/playlist/generate`);
  }, []);

  const handlePlaylistClick = () => {
    if (playlistUrl) {
      const link = document.createElement('a');
      link.href = playlistUrl;
      link.download = 'playlist.m3u';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleUrlClick = (e) => {
    e.target.select();
  };

  return (
    <div className="container">
      <h2>You are already logged in.</h2>
      
      <div className="dashboard-actions">
        <div className="playlist-section">
          <button 
            onClick={handlePlaylistClick}
            className="playlist-button"
          >
            Download Playlist
          </button>
          
          <input
            type="text"
            value={playlistUrl}
            readOnly
            onClick={handleUrlClick}
            className="playlist-url"
            placeholder="Playlist URL will appear here"
          />
        </div>
        
        <button 
          onClick={onLogout}
          disabled={loading}
          className="logout-button"
        >
          {loading ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;