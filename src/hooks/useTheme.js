// UI connector: the light / dark theme, kept in localStorage and on <html>.

import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggleDark: () => setDark(d => !d) };
}
