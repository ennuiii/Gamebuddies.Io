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

// BUG FIX #11: Priority order for notification types (lower = higher priority)
const NOTIFICATION_PRIORITY: Record<NotificationType, number> = {
  error: 0,    // Highest priority - never drop errors
  warning: 1,
  success: 2,
  info: 3,     // Lowest priority - drop first if queue full
};

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  maxNotifications = 5, // BUG FIX #11: Increased from 3 to 5
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
        const updated = [...prev, newNotification];

        // BUG FIX #11: If at max, remove lowest priority notification (not just oldest)
        if (updated.length > maxNotifications) {
          // Find the lowest priority notification to remove
          let lowestPriorityIndex = 0;
          let lowestPriority = NOTIFICATION_PRIORITY[updated[0].type];

          for (let i = 1; i < updated.length - 1; i++) { // -1 to never remove the just-added one
            const priority = NOTIFICATION_PRIORITY[updated[i].type];
            // Higher number = lower priority = more likely to be removed
            // Also prefer older notifications when priority is equal
            if (priority > lowestPriority) {
              lowestPriority = priority;
              lowestPriorityIndex = i;
            }
          }

          const removed = updated.splice(lowestPriorityIndex, 1)[0];
          if (removed) {
            const timeout = timeoutsRef.current.get(removed.id);
            if (timeout) {
              clearTimeout(timeout);
              timeoutsRef.current.delete(removed.id);
            }
            console.log(`🔔 [Notification] Dropped ${removed.type} notification to make room (priority: ${NOTIFICATION_PRIORITY[removed.type]})`);
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
