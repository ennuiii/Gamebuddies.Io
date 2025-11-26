import React, { createContext, useContext, useEffect, ReactNode } from 'react';

interface ThemeContextValue {
  theme: string;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    return { theme: 'default' };
  }
  return context;
};

const defaultTheme: Record<string, string> = {
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
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  useEffect(() => {
    const root = document.documentElement;

    Object.entries(defaultTheme).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    document.body.classList.add('theme-default');
  }, []);

  return <>{children}</>;
};
