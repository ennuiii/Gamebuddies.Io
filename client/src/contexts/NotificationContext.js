import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const NotificationContext = createContext();

export const useNotification = () => {
  return useContext(NotificationContext);
};

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null); // { message, type: 'error' | 'success' | 'info' }

  const addNotification = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    // Auto-dismiss after some time
    setTimeout(() => {
      setNotification(null);
    }, 5000); // 5 seconds
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
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
