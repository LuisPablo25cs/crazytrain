import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { setUi, store } from './state/store.js';
import { ThemeProvider } from './theme/ThemeProvider.js';
import './styles.css';

// End-to-end tests drive canvas selections through the store (open the page with `?e2e`).
if (new URLSearchParams(location.search).has('e2e')) {
  (window as unknown as { __rails: unknown }).__rails = { store, setUi };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
