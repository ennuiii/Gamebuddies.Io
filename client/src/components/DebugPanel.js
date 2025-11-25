import React, { useState, useEffect } from 'react';

const DebugPanel = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [systemState, setSystemState] = useState({});
  const [keySequence, setKeySequence] = useState('');

  useEffect(() => {
    const updateSystemState = () => {
      setSystemState({
        timestamp: new Date().toISOString(),
        url: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        sessionStorage: {
          roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
          playerName: sessionStorage.getItem('gamebuddies_playerName'),
          isHost: sessionStorage.getItem('gamebuddies_isHost'),
          gameType: sessionStorage.getItem('gamebuddies_gameType'),
          returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
        },
        environment: {
          hostname: window.location.hostname,
          origin: window.location.origin,
          userAgent: navigator.userAgent.substring(0, 100) + '...',
          serverUrl: import.meta.env.REACT_APP_SERVER_URL
        }
      });
    };

    updateSystemState();
    const interval = setInterval(updateSystemState, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyPress = (event) => {
      // Only listen for key presses if not focused on an input element
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
      }

      const newSequence = (keySequence + event.key.toLowerCase()).slice(-5); // Keep last 5 characters
      setKeySequence(newSequence);

      console.log('🐛 [DEBUG PANEL] Key sequence:', newSequence);

      if (newSequence === 'debug') {
        console.log('🐛 [DEBUG PANEL] Debug sequence detected! Showing panel.');
        setIsVisible(true);
        setKeySequence(''); // Reset sequence
      }
    };

    // Clear key sequence after a timeout
    const clearSequence = () => {
      setKeySequence('');
    };

    let timeoutId;
    if (keySequence.length > 0) {
      timeoutId = setTimeout(clearSequence, 2000); // Clear after 2 seconds of inactivity
    }

    document.addEventListener('keypress', handleKeyPress);

    return () => {
      document.removeEventListener('keypress', handleKeyPress);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [keySequence]);

  // Show debug panel only in development or when URL contains debug=true or manually triggered
  const shouldShow = import.meta.env.MODE === 'development' ||
    window.location.search.includes('debug=true') ||
    window.location.search.includes('debug=1') ||
    isVisible; // Allow manual triggering via keyboard

  if (!shouldShow) return null;

  const debugStyle = {
    position: 'fixed',
    top: '10px',
    right: '10px',
    zIndex: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    color: '#00ff00',
    padding: '10px',
    borderRadius: '5px',
    fontSize: '12px',
    fontFamily: 'monospace',
    maxWidth: '400px',
    maxHeight: '500px',
    overflow: 'auto',
    border: '1px solid #333'
  };

  const toggleStyle = {
    position: 'fixed',
    top: '10px',
    right: '10px',
    zIndex: 10000,
    backgroundColor: '#333',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px',
    border: 'none'
  };

  if (!isVisible) {
    return (
      <button
        style={toggleStyle}
        onClick={() => setIsVisible(true)}
        title="Show GameBuddies Debug Panel (or type 'debug')"
      >
        🐛 DEBUG
      </button>
    );
  }

  return (
    <div style={debugStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <strong>🐛 GameBuddies Debug Panel</strong>
        <button
          onClick={() => setIsVisible(false)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: '10px', fontSize: '10px', color: '#888' }}>
        💡 Tip: Type "debug" anywhere to show this panel
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Current State:</strong>
        <pre style={{ margin: '5px 0', fontSize: '10px', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(systemState, null, 2)}
        </pre>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Quick Actions:</strong>
        <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              console.log('🐛 [DEBUG] Current system state:', systemState);
              console.log('🐛 [DEBUG] Full session storage:', {
                ...Object.keys(sessionStorage).reduce((acc, key) => {
                  acc[key] = sessionStorage.getItem(key);
                  return acc;
                }, {})
              });
            }}
            style={{ fontSize: '10px', padding: '2px 5px', background: '#444', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
          >
            Log State
          </button>
          <button
            onClick={() => {
              Object.keys(sessionStorage).forEach(key => {
                if (key.startsWith('gamebuddies_')) {
                  sessionStorage.removeItem(key);
                }
              });
              console.log('🐛 [DEBUG] Cleared GameBuddies session storage');
            }}
            style={{ fontSize: '10px', padding: '2px 5px', background: '#600', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
          >
            Clear Session
          </button>
          <button
            onClick={() => {
              const url = new URL(window.location);
              url.searchParams.set('debug', 'true');
              window.history.replaceState({}, '', url);
              console.log('🐛 [DEBUG] Added debug=true to URL');
            }}
            style={{ fontSize: '10px', padding: '2px 5px', background: '#006', color: '#fff', border: 'none', borderRadius: '2px', cursor: 'pointer' }}
          >
            Persist Debug
          </button>
        </div>
      </div>

      {systemState.sessionStorage?.roomCode && (
        <div style={{ padding: '5px', backgroundColor: 'rgba(0, 255, 0, 0.1)', borderRadius: '3px' }}>
          <strong>🎮 Active GameBuddies Session</strong>
          <br />
          Room: {systemState.sessionStorage.roomCode}
          <br />
          Player: {systemState.sessionStorage.playerName}
          <br />
          Host: {systemState.sessionStorage.isHost}
        </div>
      )}

      {keySequence.length > 0 && (
        <div style={{ padding: '5px', backgroundColor: 'rgba(255, 255, 0, 0.1)', borderRadius: '3px', marginTop: '5px', fontSize: '10px' }}>
          Key sequence: "{keySequence}"
        </div>
      )}
    </div>
  );
};

export default DebugPanel; 