import React from 'react';
import { useNotification, Notification as NotificationType } from '../contexts/NotificationContext';
import './Notification.css';

interface NotificationItemProps {
  notification: NotificationType;
  onDismiss: () => void;
  index: number;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onDismiss, index }) => {
  const { message, type } = notification;

  // Use role="alert" for errors (announces immediately), "status" for others (polite)
  const ariaRole = type === 'error' ? 'alert' : 'status';
  const ariaLive = type === 'error' ? 'assertive' : 'polite';

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case 'error':
        return '✕';
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <div
      className={`notification-banner notification-${type}`}
      role={ariaRole}
      aria-live={ariaLive}
      aria-atomic="true"
      style={{ '--notification-index': index } as React.CSSProperties}
    >
      <span className="notification-icon" aria-hidden="true">
        {getIcon()}
      </span>
      <span className="notification-message">{message}</span>
      <button
        onClick={onDismiss}
        className="notification-close-btn"
        aria-label="Dismiss notification"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
};

const Notification: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-container" aria-label="Notifications">
      {notifications.map((notification, index) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => removeNotification(notification.id)}
          index={index}
        />
      ))}
    </div>
  );
};

export default Notification;
