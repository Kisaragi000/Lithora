// Files dragged from the desktop onto the Lithora window.
// The desktop app gets the dropped paths from Tauri; the browser build uses the page's own drop events.

export const isDesktop = '__TAURI_INTERNALS__' in window;

interface FileDropHandlers {
  onHover: (hovering: boolean) => void;
  onDrop: (paths: string[]) => void;
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
          if (drag.paths.length > 0) onDrop(drag.paths);
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

/** Reads dropped files from disk so the editor can open them like picked files. */
export async function readDroppedFiles(paths: string[]): Promise<File[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  const files: File[] = [];
  for (const path of paths) {
    try {
      const bytes = await invoke<ArrayBuffer>('read_dropped_file', { path });
      files.push(new File([bytes], path.split(/[\\/]/).pop() ?? path));
    } catch (e) {
      console.error('Could not read dropped file', path, e);
    }
  }
  return files;
}
