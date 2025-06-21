import React, { createContext, useContext, useState, useEffect } from 'react';
import '../components/ThemeEffects.css';

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
  minimal: {
    name: 'Minimal Clean',
    colors: {
      '--primary-bg': '#fafafa',
      '--secondary-bg': '#ffffff',
      '--card-bg': '#ffffff',
      '--primary-color': '#2563eb',
      '--secondary-color': '#64748b',
      '--accent-color': '#0ea5e9',
      '--text-primary': '#1e293b',
      '--text-secondary': '#64748b',
      '--neon-glow': '0 0 0 rgba(0, 0, 0, 0)',
      '--card-shadow': '0 1px 3px rgba(0, 0, 0, 0.1)'
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

  // Apply theme to CSS variables and body classes
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const theme = themes[currentTheme];
    
    // Apply CSS variables
    Object.entries(theme.colors).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    // Apply theme-specific classes to body
    body.classList.remove('theme-default', 'theme-minimal');
    body.classList.add(`theme-${currentTheme}`);
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