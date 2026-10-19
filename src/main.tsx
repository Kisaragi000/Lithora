import {lazy, Suspense, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// The engine preview needs the desktop backend, so it loads only when asked for.
const EnginePreview = lazy(() => import('./engine/EnginePreview').then((m) => ({default: m.EnginePreview})));
const isDesktop = '__TAURI_INTERNALS__' in window;

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    // A document passed on the command line opens in the engine preview.
    if (isDesktop) {
      import('@tauri-apps/api/core')
        .then(({invoke}) => invoke<string | null>('startup_file'))
        .then((path) => {
          if (path) window.location.hash = '#engine';
        })
        .catch(() => undefined);
    }
    const onHash = () => setHash(window.location.hash);
    // Ctrl+Shift+E switches between the editor and the engine preview in the desktop app.
    const onKey = (e: KeyboardEvent) => {
      if (isDesktop && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        window.location.hash = window.location.hash === '#engine' ? '' : '#engine';
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (hash === '#engine' && isDesktop) {
    return (
      <Suspense fallback={null}>
        <EnginePreview />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(<Root />);
