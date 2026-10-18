import React, { useEffect, useRef, useState } from 'react';
import { PageSettings } from '../../types/document';

interface DocumentCanvasProps {
  content: string;
  onChange: (newHtml: string) => void;
  pageSettings: PageSettings;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onSelectionChange?: () => void;
}

export const DocumentCanvas: React.FC<DocumentCanvasProps> = ({
  content,
  onChange,
  pageSettings,
  editorRef,
  onSelectionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-slate-200/90 overflow-auto p-6 sm:p-10 flex justify-center items-start min-h-0 select-text"
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
            className="document-editor-canvas focus:outline-none min-h-[800px]"
            spellCheck
          />
        </div>
      </div>
    </div>
  );
};
