// Files dragged from the desktop onto the Lithora window.
// The desktop app gets the dropped paths from Tauri; the browser build uses the page's own drop events.

export const isDesktop = '__TAURI_INTERNALS__' in window;

interface FileDropHandlers {
  onHover: (hovering: boolean) => void;
  /** The dropped files, and where they were dropped (CSS pixels in the window). */
  onDrop: (paths: string[], at: { x: number; y: number }) => void;
}

/** Listens for files dropped onto the window. Returns a function that stops listening. */
export function listenForFileDrops({ onHover, onDrop }: FileDropHandlers): () => void {
  if (!isDesktop) return () => undefined;
  let stopped = false;
  let unlisten: (() => void) | undefined;
  import('@tauri-apps/api/webview')
    .then(({ getCurrentWebview }) =>
      getCurrentWebview().onDragDropEvent((event) => {
        const drag = event.payload;
        if (drag.type === 'enter' || drag.type === 'over') {
          onHover(true);
        } else if (drag.type === 'leave') {
          onHover(false);
        } else if (drag.type === 'drop') {
          onHover(false);
          const scale = window.devicePixelRatio || 1;
          if (drag.paths.length > 0) onDrop(drag.paths, { x: drag.position.x / scale, y: drag.position.y / scale });
        }
      })
    )
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    unlisten?.();
  };
}
