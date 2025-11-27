import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from 'react';

export type NotificationType = 'error' | 'success' | 'info' | 'warning';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextValue {
  /** Array of active notifications (max 3 visible) */
  notifications: Notification[];
  /** Legacy: single notification (first in queue, for backwards compatibility) */
  notification: Notification | null;
  /** Add a notification to the queue */
  addNotification: (message: string, type?: NotificationType, duration?: number) => string;
  /** Remove a specific notification by ID */
  removeNotification: (id: string) => void;
  /** Legacy: clear first notification (for backwards compatibility) */
  clearNotification: () => void;
  /** Clear all notifications */
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
  /** Maximum number of visible notifications */
  maxNotifications?: number;
  /** Default auto-dismiss duration in ms */
  defaultDuration?: number;
}

let notificationIdCounter = 0;

const generateId = (): string => {
  notificationIdCounter += 1;
  return `notification-${notificationIdCounter}-${Date.now()}`;
};

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  maxNotifications = 3,
  defaultDuration = 5000,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeNotification = useCallback((id: string) => {
    // Clear timeout if exists
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }

    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (message: string, type: NotificationType = 'info', duration?: number): string => {
      const id = generateId();
      const actualDuration = duration ?? defaultDuration;

      const newNotification: Notification = {
        id,
        message,
        type,
        duration: actualDuration,
      };

      setNotifications((prev) => {
        // If we're at max, remove the oldest one
        const updated = [...prev, newNotification];
        if (updated.length > maxNotifications) {
          const removed = updated.shift();
          if (removed) {
            const timeout = timeoutsRef.current.get(removed.id);
            if (timeout) {
              clearTimeout(timeout);
              timeoutsRef.current.delete(removed.id);
            }
          }
        }
        return updated;
      });

      // Set auto-dismiss timeout
      if (actualDuration > 0) {
        const timeout = setTimeout(() => {
          removeNotification(id);
        }, actualDuration);
        timeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [defaultDuration, maxNotifications, removeNotification]
  );

  // Legacy: clear first notification
  const clearNotification = useCallback(() => {
    setNotifications((prev) => {
      if (prev.length > 0) {
        const first = prev[0];
        const timeout = timeoutsRef.current.get(first.id);
        if (timeout) {
          clearTimeout(timeout);
          timeoutsRef.current.delete(first.id);
        }
        return prev.slice(1);
      }
      return prev;
    });
  }, []);

  const clearAll = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current.clear();
    setNotifications([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  const value = useMemo(
    (): NotificationContextValue => ({
      notifications,
      notification: notifications[0] || null, // Legacy compatibility
      addNotification,
      removeNotification,
      clearNotification,
      clearAll,
    }),
    [notifications, addNotification, removeNotification, clearNotification, clearAll]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
