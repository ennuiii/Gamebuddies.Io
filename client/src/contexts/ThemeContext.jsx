import React, { useEffect } from 'react';

// Default theme colors - applied once on mount, no user customization
const defaultTheme = {
  '--primary-bg': '#0f0f1e',
  '--secondary-bg': '#1a1a2e',
  '--card-bg': '#16213e',
  '--primary-color': '#e94560',
  '--secondary-color': '#00d9ff',
  '--accent-color': '#ff6b6b',
  '--text-primary': '#ffffff',
  '--text-secondary': '#a8a8a8',
  '--neon-glow': '0 0 20px rgba(0, 217, 255, 0.8)',
  '--card-shadow': '0 10px 30px rgba(0, 0, 0, 0.5)'
};

export const ThemeProvider = ({ children }) => {
  // Apply default theme once on mount
  useEffect(() => {
    const root = document.documentElement;

    // Apply CSS variables
    Object.entries(defaultTheme).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    // Add default theme class
    document.body.classList.add('theme-default');
  }, []);

  return <>{children}</>;
}; 
