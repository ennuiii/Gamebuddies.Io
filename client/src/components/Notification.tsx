import React from 'react';
import { useNotification } from '../contexts/NotificationContext';
import './Notification.css';

const Notification: React.FC = () => {
  const { notification, clearNotification } = useNotification();

  if (!notification) {
    return null;
  }

  const { message, type } = notification;

  // Use role="alert" for errors (announces immediately), "status" for others (polite)
  const ariaRole = type === 'error' ? 'alert' : 'status';
  const ariaLive = type === 'error' ? 'assertive' : 'polite';

  return (
    <div
      className={`notification-banner notification-${type}`}
      role={ariaRole}
      aria-live={ariaLive}
      aria-atomic="true"
    >
      <span className="notification-message">{message}</span>
      <button
        onClick={clearNotification}
        className="notification-close-btn"
        aria-label="Dismiss notification"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
};

export default Notification;
