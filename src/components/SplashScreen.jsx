import React, { useEffect } from 'react';

const SplashScreen = ({ onEnd }) => {
  useEffect(() => {
    const video = document.querySelector('#splash-video');
    if (video) {
      video.addEventListener('ended', onEnd);
      video.addEventListener('error', onEnd);
      
      // Fallback timeout
      const timeout = setTimeout(onEnd, 5000);
      
      return () => {
        video.removeEventListener('ended', onEnd);
        video.removeEventListener('error', onEnd);
        clearTimeout(timeout);
      };
    } else {
      // If video doesn't load, end splash after 2 seconds
      const timeout = setTimeout(onEnd, 2000);
      return () => clearTimeout(timeout);
    }
  }, [onEnd]);

  return (
    <div className="splash-screen">
      <video
        id="splash-video"
        autoPlay
        muted
        playsInline
        className="splash-video"
      >
        <source src="https://watch.tataplay.com/images/splash.mp4" type="video/mp4" />
      </video>
    </div>
  );
};

export default SplashScreen;