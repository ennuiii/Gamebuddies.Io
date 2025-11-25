import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';
import './Settings.css';

const Settings = ({ isOpen, onClose }) => {
  const { currentTheme, themes, changeTheme } = useTheme();

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        className="settings-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      >
        <motion.div 
          className="settings-modal"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="settings-header">
            <h2 className="settings-title">Settings</h2>
            <button className="close-button" onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="settings-content">
            <div className="setting-section">
              <h3 className="section-title">Appearance</h3>
              <div className="theme-info">
                <label className="setting-label">Theme</label>
                <div className="current-theme">
                  <div className="theme-preview">
                    <div 
                      className="theme-color theme-primary" 
                      style={{ backgroundColor: themes.default.colors['--primary-color'] }}
                    />
                    <div 
                      className="theme-color theme-secondary" 
                      style={{ backgroundColor: themes.default.colors['--secondary-color'] }}
                    />
                    <div 
                      className="theme-color theme-accent" 
                      style={{ backgroundColor: themes.default.colors['--accent-color'] }}
                    />
                  </div>
                  <span className="theme-name">{themes.default.name}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-footer">
            <button className="settings-done-button" onClick={onClose}>
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Settings; 
