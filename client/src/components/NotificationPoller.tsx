import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification, NotificationType } from '../contexts/NotificationContext';

const NotificationPoller: React.FC = () => {
  const { session, isAuthenticated } = useAuth();
  const { addNotification } = useNotification();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only poll if authenticated
    if (!isAuthenticated || !session?.access_token) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const fetchNotifications = async () => {
      try {
        // Skip if tab is hidden to save resources (optional, but good practice)
        if (document.hidden) return;

        const response = await fetch('/api/notifications', {
          headers: { 
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        
        if (data.success && Array.isArray(data.notifications)) {
          // Process notifications sequentially to avoid flooding
          for (const note of data.notifications) {
            // Map backend types to frontend NotificationType
            let type: NotificationType = 'info';
            let duration = 5000;

            if (note.type === 'achievement') {
              type = 'success';
              duration = 8000; // Longer for achievements
            } else if (['error', 'success', 'warning', 'info'].includes(note.type)) {
              type = note.type as NotificationType;
            }

            // Display notification
            addNotification(note.message, type, duration);

            // Mark as read immediately
            // Fire-and-forget to avoid blocking the loop
            fetch(`/api/notifications/${note.id}/read`, {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              },
            }).catch(err => console.error('Failed to mark notification read:', err));
          }
        }
      } catch (error) {
        // Silent error to not spam console during network blips
        // console.error('Notification polling error', error);
      }
    };

    // Initial fetch on mount/auth
    fetchNotifications();

    // Poll every 10 seconds
    pollingRef.current = setInterval(fetchNotifications, 10000);

    // Add visibility change listener to fetch immediately when returning to tab
    const handleVisibilityChange = () => {
      if (!document.hidden && isAuthenticated) {
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, session, addNotification]);

  return null;
};

export default NotificationPoller;
