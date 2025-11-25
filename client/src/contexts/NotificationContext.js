import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';

const NotificationContext = createContext();

export const useNotification = () => {
  return useContext(NotificationContext);
};

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null); // { message, type: 'error' | 'success' | 'info' }
  const timeoutRef = useRef(null);

  const addNotification = useCallback((message, type = 'info') => {
    // Clear any existing timeout to prevent memory buildup
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setNotification({ message, type });

    // Store timeout reference for cleanup
    timeoutRef.current = setTimeout(() => {
      setNotification(null);
      timeoutRef.current = null;
    }, 5000); // 5 seconds
  }, []);

  const clearNotification = useCallback(() => {
    // Clear timeout when manually clearing notification
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setNotification(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({
    notification,
    addNotification,
    clearNotification,
  }), [notification, addNotification, clearNotification]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
