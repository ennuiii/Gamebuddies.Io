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
      '--card-shadow': '0 10px 30px rgba(0, 0, 0, 0.5)',
    },
  },
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

  // Apply theme to CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const theme = themes[currentTheme];

    // Apply CSS variables
    Object.entries(theme.colors).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    // Remove any theme classes since we only have default now
    body.classList.remove('theme-default', 'theme-compact', 'theme-sleek');
    body.classList.add(`theme-${currentTheme}`);
  }, [currentTheme]);

  const changeTheme = themeKey => {
    if (themes[themeKey]) {
      setCurrentTheme(themeKey);
      localStorage.setItem('gamebuddies-theme', themeKey);
    }
  };

  const value = {
    currentTheme,
    themes,
    changeTheme,
    currentThemeData: themes[currentTheme],
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
