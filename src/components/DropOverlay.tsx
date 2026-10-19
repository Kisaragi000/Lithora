import React from 'react';
import { FileDown } from 'lucide-react';

/** Shown over the window while files are dragged onto it. */
export const DropOverlay: React.FC<{ label: string }> = ({ label }) => (
  <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[#083B69]/10 p-4">
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#376FA3] bg-[#FBF8F0]/80">
      <FileDown className="h-10 w-10 text-[#376FA3]" />
      <span className="text-base font-semibold text-[#083B69]">{label}</span>
    </div>
  </div>
);
