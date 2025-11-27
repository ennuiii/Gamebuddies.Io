import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import './ConnectionStatus.css';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface ConnectionStatusProps {
  /** Show only when there's an issue (hide when connected) */
  showOnlyOnIssue?: boolean;
  /** Position of the indicator */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Custom class name */
  className?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  showOnlyOnIssue = true,
  position = 'bottom-right',
  className = '',
}) => {
  const { socket, isConnected } = useSocket();
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [showConnected, setShowConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!socket) {
      setState('disconnected');
      return;
    }

    const handleConnect = (): void => {
      setState('connected');
      setReconnectAttempt(0);
      // Show "Connected" briefly then hide
      setShowConnected(true);
      setTimeout(() => setShowConnected(false), 2000);
    };

    const handleDisconnect = (): void => {
      setState('disconnected');
    };

    const handleConnecting = (): void => {
      setState('connecting');
    };

    const handleReconnectAttempt = (attempt: number): void => {
      setState('connecting');
      setReconnectAttempt(attempt);
    };

    const handleReconnectFailed = (): void => {
      setState('disconnected');
    };

    // Set initial state
    if (socket.connected) {
      setState('connected');
    } else if (socket.active) {
      setState('connecting');
    } else {
      setState('disconnected');
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('reconnect_failed', handleReconnectFailed);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('reconnect_failed', handleReconnectFailed);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
    };
  }, [socket]);

  // Update visibility based on state
  useEffect(() => {
    if (showOnlyOnIssue) {
      setIsVisible(state !== 'connected' || showConnected);
    } else {
      setIsVisible(true);
    }
  }, [state, showOnlyOnIssue, showConnected]);

  // Also check isConnected from context
  useEffect(() => {
    if (isConnected && state !== 'connected') {
      setState('connected');
    }
  }, [isConnected, state]);

  if (!isVisible) {
    return null;
  }

  const handleRetry = (): void => {
    if (socket && !socket.connected) {
      socket.connect();
      setState('connecting');
    }
  };

  const getStatusConfig = () => {
    switch (state) {
      case 'connected':
        return {
          icon: '●',
          text: 'Connected',
          className: 'status-connected',
        };
      case 'connecting':
        return {
          icon: '◌',
          text: reconnectAttempt > 0
            ? `Reconnecting... (${reconnectAttempt}/3)`
            : 'Connecting...',
          className: 'status-connecting',
        };
      case 'disconnected':
        return {
          icon: '○',
          text: 'Disconnected',
          className: 'status-disconnected',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`connection-status ${config.className} position-${position} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-icon" aria-hidden="true">{config.icon}</span>
      <span className="status-text">{config.text}</span>
      {state === 'disconnected' && (
        <button
          className="retry-btn"
          onClick={handleRetry}
          aria-label="Retry connection"
        >
          Retry
        </button>
      )}
    </div>
  );
};

export default ConnectionStatus;
