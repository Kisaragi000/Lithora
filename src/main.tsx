import {lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// The desktop app edits documents in Lithora's own engine. The browser build has no engine,
// so it keeps the web editor.
const DesktopApp = lazy(() => import('./desktop/DesktopApp').then((m) => ({default: m.DesktopApp})));
const isDesktop = '__TAURI_INTERNALS__' in window;

createRoot(document.getElementById('root')!).render(
  isDesktop ? (
    <Suspense fallback={null}>
      <DesktopApp />
    </Suspense>
  ) : (
    <App />
  ),
);
