import React from 'react';
import { useNotification } from '../contexts/NotificationContext';
import './Notification.css';

const Notification: React.FC = () => {
  const { notification, clearNotification } = useNotification();

  if (!notification) {
    return null;
  }

  const { message, type } = notification;

  return (
    <div className={`notification-banner notification-${type}`}>
      <span className="notification-message">{message}</span>
      <button onClick={clearNotification} className="notification-close-btn">
        &times;
      </button>
    </div>
  );
};

export default Notification;
