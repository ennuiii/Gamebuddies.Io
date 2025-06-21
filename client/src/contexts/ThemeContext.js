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
  compact: {
    name: 'Compact Dark',
    colors: {
      '--primary-bg': '#0d1117',
      '--secondary-bg': '#161b22',
      '--card-bg': '#21262d',
      '--primary-color': '#58a6ff',
      '--secondary-color': '#7d8590',
      '--accent-color': '#39d353',
      '--text-primary': '#f0f6fc',
      '--text-secondary': '#8b949e',
      '--neon-glow': '0 0 10px rgba(88, 166, 255, 0.3)',
      '--card-shadow': '0 3px 12px rgba(0, 0, 0, 0.4)'
    }
  },
  sleek: {
    name: 'Sleek Corporate',
    colors: {
      '--primary-bg': '#0f0f23',
      '--secondary-bg': '#1a1a2e',
      '--card-bg': '#16213e',
      '--primary-color': '#6366f1',
      '--secondary-color': '#a78bfa',
      '--accent-color': '#8b5cf6',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#cbd5e1',
      '--neon-glow': '0 0 15px rgba(99, 102, 241, 0.4)',
      '--card-shadow': '0 8px 25px rgba(0, 0, 0, 0.6)'
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
    body.classList.remove('theme-default', 'theme-compact', 'theme-sleek');
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