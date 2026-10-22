import {lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

// Lithora is a desktop app: documents are opened, laid out and saved by its Rust engine,
// which only exists inside the Tauri shell. In a plain browser, point people to the installers.
const DesktopApp = lazy(() => import('./desktop/DesktopApp').then((m) => ({default: m.DesktopApp})));
const isDesktop = '__TAURI_INTERNALS__' in window;

function BrowserNotice() {
  return (
    <div style={{fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '15vh auto', padding: 16, color: '#083B69'}}>
      <h1 style={{fontSize: 24, marginBottom: 12}}>Lithora is a desktop app</h1>
      <p style={{lineHeight: 1.5}}>
        Run it with <code>npm run tauri dev</code>, or download the Windows and Linux installers from{' '}
        <a href="https://github.com/Kisaragi000/Lithora/releases">GitHub Releases</a>.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  isDesktop ? (
    <Suspense fallback={null}>
      <DesktopApp />
    </Suspense>
  ) : (
    <BrowserNotice />
  ),
);
