import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Snapshot } from './types';
import { buildHistoryPdf, type ReportFonts } from './history-report';

let fontPromise: Promise<ReportFonts> | undefined;
function loadFonts() {
  return fontPromise ??= Promise.all(['Regular', 'Medium'].map(async weight => {
    const response = await fetch(`/fonts/aeonik/Aeonik-${weight}.ttf`);
    if (!response.ok) throw new Error('Could not load the report font. Please retry.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  })).then(([regular, medium]) => ({ regular, medium })).catch((error: unknown) => { fontPromise = undefined; throw error; });
}

export async function exportHistoryPdf(snapshot: Snapshot): Promise<boolean> {
  const frozen = structuredClone(snapshot);
  const exportedAt = Date.now();
  const bytes = buildHistoryPdf(frozen, await loadFonts(), exportedAt);
  const fileName = `WhizReveal-${new Date(exportedAt).toISOString().slice(0, 10)}-${frozen.sessionId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12) || 'session'}.pdf`;
  if (isTauri()) return invoke<boolean>('save_history_pdf', { fileName, bytes: Array.from(bytes) });
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
  // Keep the object alive long enough for browser download handlers to consume it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
