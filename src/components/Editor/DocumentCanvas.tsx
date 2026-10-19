import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PageSettings } from '../../types/document';
import { ProofreadPopover, ActiveProofreadPopoverData } from './ProofreadPopover';
import { ProofreadIssueType } from '../../services/localProofreaderService';

interface DocumentCanvasProps {
  content: string;
  onChange: (newHtml: string) => void;
  pageSettings: PageSettings;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onSelectionChange?: () => void;
  onAcceptProofread?: (id: string) => void;
  onDismissProofread?: (id: string) => void;
}

export const DocumentCanvas: React.FC<DocumentCanvasProps> = ({
  content,
  onChange,
  pageSettings,
  editorRef,
  onSelectionChange,
  onAcceptProofread,
  onDismissProofread,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePopoverData, setActivePopoverData] = useState<ActiveProofreadPopoverData | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync initial and external content changes safely
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
  }, [content, editorRef]);

  // Margin calculation in pixels (approx 96 DPI: 1 inch = 96px = 25.4mm)
  const getPaddingStyle = () => {
    switch (pageSettings.margins) {
      case 'narrow':
        return '45px'; // 12mm
      case 'wide':
        return '140px'; // 38mm
      case 'normal':
      default:
        return '94px'; // 25mm (~1 inch)
    }
  };

  // Dimensions based on page size and orientation
  const getPageDimensions = () => {
    let width = 794; // A4 portrait in px
    let minHeight = 1123;

    if (pageSettings.size === 'Letter') {
      width = 816;
      minHeight = 1056;
    } else if (pageSettings.size === 'Legal') {
      width = 816;
      minHeight = 1344;
    }

    if (pageSettings.orientation === 'landscape') {
      const temp = width;
      width = minHeight;
      minHeight = temp;
    }

    return { width, minHeight };
  };

  const { width, minHeight } = getPageDimensions();
  const zoomScale = (pageSettings.zoom || 100) / 100;

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Hover detection over lavender-marked text
  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const markEl = target?.closest('.proofread-lavender-mark') as HTMLElement | null;

    if (markEl) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      const id = markEl.getAttribute('data-proofread-id') || '';
      const original = markEl.getAttribute('data-original') || markEl.textContent || '';
      const replacement = markEl.getAttribute('data-replacement') || '';
      const type = (markEl.getAttribute('data-type') || 'spelling') as ProofreadIssueType;
      const language = (markEl.getAttribute('data-lang') || 'en') as 'en' | 'ru' | 'hy';
      const explanation = markEl.getAttribute('data-explanation') || '';
      const targetRect = markEl.getBoundingClientRect();

      setActivePopoverData({
        id,
        original,
        replacement,
        type,
        language,
        explanation,
        targetRect,
      });
    }
  }, []);

  const handleAcceptSuggestion = (id: string) => {
    if (onAcceptProofread) {
      onAcceptProofread(id);
    } else if (editorRef.current) {
      const markEl = editorRef.current.querySelector(`.proofread-lavender-mark[data-proofread-id="${id}"]`);
      if (markEl) {
        const replacement = markEl.getAttribute('data-replacement') || '';
        const textNode = document.createTextNode(replacement);
        markEl.parentNode?.replaceChild(textNode, markEl);
        onChange(editorRef.current.innerHTML);
      }
    }
    setActivePopoverData(null);
  };

  const handleDismissSuggestion = (id: string) => {
    if (onDismissProofread) {
      onDismissProofread(id);
    } else if (editorRef.current) {
      const markEl = editorRef.current.querySelector(`.proofread-lavender-mark[data-proofread-id="${id}"]`);
      if (markEl) {
        const parent = markEl.parentNode;
        while (markEl.firstChild) {
          parent?.insertBefore(markEl.firstChild, markEl);
        }
        parent?.removeChild(markEl);
        onChange(editorRef.current.innerHTML);
      }
    }
    setActivePopoverData(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleEditorMouseMove}
      className="flex-1 bg-slate-200/90 overflow-auto p-6 sm:p-10 flex justify-center items-start min-h-0 select-text relative"
      style={{
        scrollbarGutter: 'stable',
      }}
    >
      {/* Zoom transform container */}
      <div
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: 'top center',
          transition: 'transform 0.15s ease-out',
        }}
        className="pb-16"
      >
        {/* Paginated Paper Sheet */}
        <div
          className="bg-white shadow-xl border border-slate-300 print-page transition-shadow"
          style={{
            width: `${width}px`,
            minHeight: `${minHeight}px`,
            backgroundColor: pageSettings.pageColor || '#ffffff',
            padding: getPaddingStyle(),
            boxSizing: 'border-box',
          }}
        >
          {/* Contenteditable WYSIWYG surface */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyUp={onSelectionChange}
            onMouseUp={onSelectionChange}
            onClick={(e) => {
              handleEditorMouseMove(e);
              if (onSelectionChange) onSelectionChange();
            }}
            className="document-editor-canvas focus:outline-none min-h-[800px]"
            spellCheck
          />
        </div>
      </div>

      {/* Floating suggestion popover on hover over lavender text */}
      {activePopoverData && (
        <ProofreadPopover
          data={activePopoverData}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
          onClose={() => setActivePopoverData(null)}
        />
      )}
    </div>
  );
};
