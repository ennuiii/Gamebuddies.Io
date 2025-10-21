import React, { useEffect, useState } from 'react';
import socketService, { ConnectionStatus as Status } from '../utils/socket';
import './ConnectionStatus.css';

const ConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<Status>(socketService.getConnectionStatus());

  useEffect(() => {
    const cleanup = socketService.onConnectionStatusChange(newStatus => {
      setStatus(newStatus);
    });

    return cleanup;
  }, []);

  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected';
      default:
        return '';
    }
  };

  const getStatusClass = () => {
    return `connection-status connection-status-${status}`;
  };

  return (
    <div className={getStatusClass()}>
      <div className="connection-status-indicator"></div>
      <span className="connection-status-text">{getStatusText()}</span>
    </div>
  );
};

export default ConnectionStatus;
