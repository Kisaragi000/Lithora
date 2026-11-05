/**
 * The Fonts panel of a PDF, like the Missing Fonts dialogs of InDesign and Photoshop: every
 * font the PDF uses and how it stands. A missing font can be found (a font file, which Lithora
 * keeps) or replaced with an installed font; new letters typed in a font the PDF holds only
 * part of are drawn in the replacement too.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { CheckCircle2, CircleAlert, FileType2, FolderSearch, Info, Loader2 } from 'lucide-react';
import type { Strings } from './strings';
import { Modal, PrimaryButton } from './Dialogs';
import { FontStatus, pdf, PdfFontReport, PdfInfo } from './pdf';

const STATUS_STYLE: Record<FontStatus, string> = {
  missing: 'bg-red-50 text-red-700 border-red-200',
  subset: 'bg-amber-50 text-amber-800 border-amber-200',
  embedded: 'bg-sky-50 text-sky-800 border-sky-200',
  builtin: 'bg-slate-50 text-slate-700 border-slate-200',
  installed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

function statusLabel(t: Strings, s: FontStatus) {
  return { missing: t.statusMissing, subset: t.statusSubset, embedded: t.statusEmbedded, builtin: t.statusBuiltin, installed: t.statusInstalled }[s];
}

function statusHelp(t: Strings, f: PdfFontReport) {
  const help = { missing: t.helpMissing, subset: t.helpSubset, embedded: t.helpEmbedded, builtin: t.helpBuiltin, installed: t.helpInstalled }[f.status];
  return help.replace('{font}', f.replacement);
}

export function PdfFontsDialog({
  t,
  info,
  onClose,
  onChanged,
  onNotice,
}: {
  t: Strings;
  info: PdfInfo;
  onClose(): void;
  /** A replacement was chosen or a font added: the pages are drawn again. */
  onChanged(info: PdfInfo): void;
  onNotice(text: string, error?: boolean): void;
}) {
  const [fonts, setFonts] = useState<PdfFontReport[] | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    pdf
      .fonts(info.id)
      .then(setFonts)
      .catch((e) => onNotice(String(e), true));
    pdf
      .installedFonts()
      .then((list) => setInstalled([...new Set(list)].sort((a, b) => a.localeCompare(b))))
      .catch(() => undefined);
  }, [info.id, onNotice]);
  useEffect(load, [load]);

  const replace = async (f: PdfFontReport, family: string | null) => {
    try {
      onChanged(await pdf.replaceFont(info.id, f.key, family));
      load();
    } catch (e) {
      onNotice(String(e), true);
    }
  };

  const findFile = async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: t.pdfFontFiles, extensions: ['ttf', 'otf', 'ttc', 'otc', 'woff', 'woff2'] }] });
    if (!picked) return;
    setBusy(true);
    const added: string[] = [];
    for (const path of Array.isArray(picked) ? picked : [picked]) {
      try {
        added.push(...(await pdf.addFontFile(path)));
      } catch (e) {
        onNotice(`${t.pdfFontNotAdded}: ${e}`, true);
      }
    }
    setBusy(false);
    if (added.length > 0) {
      onNotice(t.pdfFontAdded.replace('{family}', [...new Set(added)].join(', ')));
      onChanged(await pdf.state(info.id));
      load();
    }
  };

  return (
    <Modal
      title={t.pdfFontsTitle}
      onClose={onClose}
      width="w-[780px]"
      footer={
        <>
          <button
            type="button"
            onClick={() => void findFile()}
            disabled={busy}
            className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4 text-[#376FA3]" />}
            {t.pdfFindFont}
          </button>
          <PrimaryButton onClick={onClose}>{t.close}</PrimaryButton>
        </>
      }
    >
      <p className="mb-3 flex gap-2 text-[12.5px] text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#376FA3]" />
        {t.pdfFontsIntro}
      </p>
      {fonts === null ? (
        <div className="flex h-24 items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
          {fonts.map((f) => {
            const canReplace = f.status === 'missing' || f.status === 'subset' || f.status === 'builtin' || f.replaced;
            return (
              <div key={f.key} className="flex items-start gap-3 px-3 py-2.5">
                {f.status === 'missing' ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                ) : f.status === 'installed' || f.status === 'embedded' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <FileType2 className="mt-0.5 h-4 w-4 shrink-0 text-[#376FA3]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{f.name}</span>
                    <span className={`rounded border px-1.5 py-px text-[11px] font-medium ${STATUS_STYLE[f.status]}`}>{statusLabel(t, f.status)}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">{statusHelp(t, f)}</div>
                  {f.pages.length > 0 && (
                    <div className="text-[11.5px] text-slate-400">
                      {t.pdfPagesUsed}: {f.pages.length > 12 ? `${f.pages.slice(0, 12).join(', ')}…` : f.pages.join(', ')}
                    </div>
                  )}
                </div>
                {canReplace && (
                  <label className="flex shrink-0 flex-col gap-0.5 text-[11px] text-slate-500">
                    {t.pdfReplaceWith}
                    <select
                      value={f.replaced ? f.replacement : ''}
                      onChange={(e) => void replace(f, e.target.value || null)}
                      className="h-8 w-60 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:border-[#376FA3] focus:outline-none"
                    >
                      <option value="">{f.replaced ? t.pdfAutomatic.replace(/\s*\(\{font\}\)/, '') : t.pdfAutomatic.replace('{font}', f.replacement)}</option>
                      {installed.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
