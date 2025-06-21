import React, { createContext, useContext, useState, useEffect } from 'react';

const themes = {
  default: {
    name: 'GameBuddies Classic',
    colors: {
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
    }
  },
  lol: {
    name: 'League of Legends',
    colors: {
      '--primary-bg': '#010a13',
      '--secondary-bg': '#0a1428',
      '--card-bg': '#1e2328',
      '--primary-color': '#c89b3c',
      '--secondary-color': '#cdbe91',
      '--accent-color': '#f0e6d2',
      '--text-primary': '#f0e6d2',
      '--text-secondary': '#cdbe91',
      '--neon-glow': '0 0 20px rgba(200, 155, 60, 0.8)',
      '--card-shadow': '0 10px 30px rgba(0, 0, 0, 0.8)'
    }
  }
};

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState('default');

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('gamebuddies-theme');
    if (savedTheme && themes[savedTheme]) {
      setCurrentTheme(savedTheme);
    }
  }, []);

  // Apply theme to CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const theme = themes[currentTheme];
    
    Object.entries(theme.colors).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  }, [currentTheme]);

  const changeTheme = (themeKey) => {
    if (themes[themeKey]) {
      setCurrentTheme(themeKey);
      localStorage.setItem('gamebuddies-theme', themeKey);
    }
  };

  const value = {
    currentTheme,
    themes,
    changeTheme,
    currentThemeData: themes[currentTheme]
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}; 