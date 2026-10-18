import React from 'react';

interface DocumentRulerProps {
  pageWidthMm?: number;
  marginMm?: number;
}

export const DocumentRuler: React.FC<DocumentRulerProps> = ({
  pageWidthMm = 210, // A4 standard width in mm
  marginMm = 25,     // 25mm normal margins
}) => {
  // Generate tick markers in centimeters (0 to ~21 cm)
  const totalCm = Math.floor(pageWidthMm / 10);
  const leftMarginCm = marginMm / 10;
  const rightMarginCm = (pageWidthMm - marginMm) / 10;

  return (
    <div className="h-6 bg-slate-100 border-b border-slate-300 flex items-center justify-center select-none overflow-hidden text-[10px] text-slate-500 font-mono no-print">
      <div className="relative w-[794px] h-full bg-slate-200 border-x border-slate-300 flex items-center">
        {/* Printable White Area */}
        <div
          className="absolute top-0 bottom-0 bg-white border-x border-slate-300 shadow-xs"
          style={{
            left: `${(leftMarginCm / totalCm) * 100}%`,
            right: `${((totalCm - rightMarginCm) / totalCm) * 100}%`,
          }}
        />

        {/* Left Indent Marker */}
        <div
          className="absolute top-0 bottom-0 w-2 flex flex-col items-center justify-between cursor-ew-resize z-10"
          style={{ left: `${(leftMarginCm / totalCm) * 100}%`, transform: 'translateX(-50%)' }}
          title="Left Margin"
        >
          <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-blue-600" />
          <div className="w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-blue-600" />
        </div>

        {/* Right Margin Marker */}
        <div
          className="absolute top-0 bottom-0 w-2 flex flex-col items-center justify-between cursor-ew-resize z-10"
          style={{ left: `${(rightMarginCm / totalCm) * 100}%`, transform: 'translateX(-50%)' }}
          title="Right Margin"
        >
          <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-blue-600" />
          <div className="w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-blue-600" />
        </div>

        {/* Centimeter Ticks */}
        {Array.from({ length: totalCm + 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col items-center justify-end pb-0.5 pointer-events-none"
            style={{ left: `${(i / totalCm) * 100}%` }}
          >
            <div className="h-2 w-px bg-slate-400" />
            <span className="text-[8px] leading-none text-slate-600 font-semibold">{i}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
