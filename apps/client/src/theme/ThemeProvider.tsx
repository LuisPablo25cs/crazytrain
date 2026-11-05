import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Theme } from '@rails/shared';
import { session } from '../net/socket.js';
import { THEMES, themeById } from './themes.js';

interface ThemeContextValue {
  theme: Theme;
  themes: Theme[];
  setTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(() => themeById(session.theme()));

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--panel', theme.ui.panel);
    root.setProperty('--panel-text', theme.ui.panelText);
    root.setProperty('--accent', theme.ui.accent);
    root.setProperty('--muted', theme.ui.muted);
    root.setProperty('--background', theme.terrain.background);
    for (const [card, hex] of Object.entries(theme.cardColors)) root.setProperty(`--card-${card}`, hex);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themes: THEMES,
      setTheme: (id) => {
        session.saveTheme(id);
        setThemeState(themeById(id));
      },
    }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme outside ThemeProvider');
  return value;
}
