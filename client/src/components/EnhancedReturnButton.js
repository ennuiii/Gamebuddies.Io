import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useLobbyState } from '../hooks/useLobbyState';
import './EnhancedReturnButton.css';

const EnhancedReturnButton = ({ 
  style = {}, 
  className = '', 
  children,
  position = 'top-left',
  showForAllPlayers = true,
  autoHide = true,
  customReturnUrl = null
}) => {
  const { socket, isConnected, playerStatus, syncStatus } = useSocket();
  const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
  const { currentPlayer, canReturnToLobby, updatePlayerStatus } = useLobbyState(roomCode);
  
  const [isReturning, setIsReturning] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [returnError, setReturnError] = useState(null);
  const [returnMethod, setReturnMethod] = useState('individual'); // 'individual' or 'group'

  // Determine if button should be visible
  useEffect(() => {
    const shouldShow = () => {
      // Don't show if auto-hide is enabled and we're not in a returnable state
      if (autoHide && !canReturnToLobby()) {
        return false;
      }

      // Show for all players if enabled, otherwise only for host
      if (showForAllPlayers) {
        return playerStatus.inGame || playerStatus.currentLocation === 'game';
      } else {
        return currentPlayer?.isHost && (playerStatus.inGame || playerStatus.currentLocation === 'game');
      }
    };

    setIsVisible(shouldShow());
  }, [playerStatus, currentPlayer, canReturnToLobby, showForAllPlayers, autoHide]);

  // Individual return to lobby
  const handleIndividualReturn = useCallback(async () => {
    if (isReturning || !socket || !isConnected) {
      return;
    }

    setIsReturning(true);
    setReturnError(null);

    try {
      console.log('🔄 [RETURN] Individual return initiated');
      
      // Update player status to returning
      const success = await updatePlayerStatus('returning', 'lobby', {
        reason: 'Individual return to lobby',
        returnType: 'individual',
        initiatedAt: new Date().toISOString()
      });

      if (!success) {
        throw new Error('Failed to update player status');
      }

      // Navigate back to GameBuddies
      const returnUrl = customReturnUrl || 
                       sessionStorage.getItem('gamebuddies_returnUrl') || 
                       window.location.origin;
      
      console.log('🔄 [RETURN] Redirecting to:', returnUrl);
      
      // Small delay to ensure status update is processed
      setTimeout(() => {
        window.location.href = returnUrl;
      }, 500);

    } catch (error) {
      console.error('❌ [RETURN] Individual return failed:', error);
      setReturnError(error.message);
      setIsReturning(false);
    }
  }, [socket, isConnected, updatePlayerStatus, customReturnUrl, isReturning]);

  // Group return (host only)
  const handleGroupReturn = useCallback(async () => {
    if (isReturning || !socket || !isConnected || !currentPlayer?.isHost) {
      return;
    }

    setIsReturning(true);
    setReturnError(null);

    try {
      console.log('👑 [RETURN] Group return initiated by host');
      
      // Emit group return event
      socket.emit('initiateGroupReturn', {
        roomCode,
        reason: 'Host initiated group return'
      });

      // The server will handle broadcasting to all players
      // and the socket context will handle the redirect

    } catch (error) {
      console.error('❌ [RETURN] Group return failed:', error);
      setReturnError(error.message);
      setIsReturning(false);
    }
  }, [socket, isConnected, currentPlayer, roomCode, isReturning]);

  // Handle return action based on method
  const handleReturn = useCallback(() => {
    if (returnMethod === 'group' && currentPlayer?.isHost) {
      handleGroupReturn();
    } else {
      handleIndividualReturn();
    }
  }, [returnMethod, currentPlayer, handleGroupReturn, handleIndividualReturn]);

  // Listen for group return events
  useEffect(() => {
    if (!socket) return;

    const handleGroupReturnInitiated = (data) => {
      console.log('🔄 [RETURN] Group return received:', data);
      setIsReturning(true);
      
      // The EnhancedSocketContext will handle the actual redirect
      // We just update the UI here
    };

    socket.on('groupReturnInitiated', handleGroupReturnInitiated);

    return () => {
      socket.off('groupReturnInitiated', handleGroupReturnInitiated);
    };
  }, [socket]);

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  // Position styles
  const getPositionStyle = () => {
    const positions = {
      'top-left': { top: '20px', left: '20px' },
      'top-right': { top: '20px', right: '20px' },
      'bottom-left': { bottom: '20px', left: '20px' },
      'bottom-right': { bottom: '20px', right: '20px' },
      'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
      'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' }
    };
    return positions[position] || positions['top-left'];
  };

  const defaultStyle = {
    position: 'fixed',
    zIndex: 1000,
    padding: '12px 20px',
    backgroundColor: isReturning ? '#666' : '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: isReturning ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    opacity: isReturning ? 0.7 : 1,
    ...getPositionStyle(),
    ...style
  };

  const getButtonText = () => {
    if (isReturning) {
      return returnMethod === 'group' ? '🔄 Returning All Players...' : '🔄 Returning...';
    }
    
    if (children) {
      return children;
    }
    
    if (currentPlayer?.isHost && returnMethod === 'group') {
      return '← Return All Players to Lobby';
    }
    
    return '← Return to Lobby';
  };

  const getButtonTitle = () => {
    if (currentPlayer?.isHost) {
      return returnMethod === 'group' 
        ? 'Return all players to GameBuddies lobby'
        : 'Return to GameBuddies lobby (individual)';
    }
    return 'Return to GameBuddies lobby';
  };

  return (
    <div className={`enhanced-return-button-container ${className}`}>
      <button
        onClick={handleReturn}
        disabled={isReturning || !isConnected}
        style={defaultStyle}
        className="enhanced-return-button"
        title={getButtonTitle()}
      >
        {getButtonText()}
      </button>
      
      {/* Host controls for return method */}
      {currentPlayer?.isHost && !isReturning && (
        <div 
          className="return-method-selector"
          style={{
            position: 'absolute',
            top: position.includes('top') ? '100%' : 'auto',
            bottom: position.includes('bottom') ? '100%' : 'auto',
            left: position.includes('left') ? '0' : 'auto',
            right: position.includes('right') ? '0' : 'auto',
            marginTop: position.includes('top') ? '8px' : '0',
            marginBottom: position.includes('bottom') ? '8px' : '0',
            backgroundColor: 'rgba(0,0,0,0.8)',
            borderRadius: '4px',
            padding: '8px',
            fontSize: '12px',
            whiteSpace: 'nowrap'
          }}
        >
          <label style={{ color: 'white', display: 'block', marginBottom: '4px' }}>
            <input
              type="radio"
              value="individual"
              checked={returnMethod === 'individual'}
              onChange={(e) => setReturnMethod(e.target.value)}
              style={{ marginRight: '6px' }}
            />
            Return Individually
          </label>
          <label style={{ color: 'white', display: 'block' }}>
            <input
              type="radio"
              value="group"
              checked={returnMethod === 'group'}
              onChange={(e) => setReturnMethod(e.target.value)}
              style={{ marginRight: '6px' }}
            />
            Return All Players
          </label>
        </div>
      )}
      
      {/* Error display */}
      {returnError && (
        <div 
          className="return-error-message"
          style={{
            position: 'absolute',
            top: position.includes('top') ? '100%' : 'auto',
            bottom: position.includes('bottom') ? '100%' : 'auto',
            left: position.includes('left') ? '0' : 'auto',
            right: position.includes('right') ? '0' : 'auto',
            marginTop: position.includes('top') ? '8px' : '0',
            marginBottom: position.includes('bottom') ? '8px' : '0',
            backgroundColor: '#f44336',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            maxWidth: '200px'
          }}
        >
          {returnError}
          <button
            onClick={() => setReturnError(null)}
            style={{
              marginLeft: '8px',
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ×
          </button>
        </div>
      )}
      
      {/* Connection status indicator */}
      {!isConnected && (
        <div
          className="connection-status-indicator"
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '16px',
            height: '16px',
            backgroundColor: '#f44336',
            borderRadius: '50%',
            border: '2px solid white'
          }}
          title="Not connected to GameBuddies server"
        />
      )}
    </div>
  );
};

export default EnhancedReturnButton;