import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import '../history-export.css';

export function HistoryExportButton({ snapshot, busy }: { snapshot: Snapshot; busy: boolean }) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);
  const pending = useRef(false);
  const session = useRef(snapshot.sessionId);
  session.current = snapshot.sessionId;
  const hasResults = snapshot.history.some(draw => draw.id !== snapshot.activeDraw?.draw.id);
  const disabled = busy || exporting || !!snapshot.activeDraw || !hasResults;

  useEffect(() => { setStatus(null); }, [snapshot.sessionId]);

  async function exportPdf() {
    if (disabled || pending.current) return;
    pending.current = true;
    setExporting(true);
    setStatus(null);
    const currentSession = snapshot.sessionId;
    try {
      // Keep the report consistent even if the user starts another draw while saving.
      const exportSnapshot = structuredClone(snapshot);
      const { exportHistoryPdf } = await import('../lib/history-pdf');
      const saved = await exportHistoryPdf(exportSnapshot);
      if (session.current === currentSession) {
        setStatus({ message: saved ? 'PDF exported.' : 'Export canceled.', error: false });
      }
    } catch {
      if (session.current === currentSession) {
        setStatus({ message: 'Could not export the PDF. Please try again.', error: true });
      }
    } finally {
      pending.current = false;
      setExporting(false);
    }
  }

  return (
    <div className="history-export">
      <button type="button" className="secondary-button history-export-button" disabled={disabled}
        aria-busy={exporting} onClick={() => void exportPdf()}
        title={!hasResults ? 'Complete a draw to export this session' : snapshot.activeDraw ? 'Wait for the draw to finish' : 'Save this session’s results as a PDF'}>
        {exporting ? <LoaderCircle size={15} className="history-export-spinner" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
        <span>{exporting ? 'Exporting…' : 'Export PDF'}</span>
      </button>
      <div className="history-export-status" role={status?.error ? 'alert' : 'status'} aria-live={status?.error ? 'assertive' : 'polite'} aria-atomic="true">
        {status?.message}
      </div>
    </div>
  );
}
