import { jsPDF } from 'jspdf';
import type { DrawRecord, Snapshot } from './types';

const COLORS = { ink: '#0B0D10', panel: '#171C22', line: '#2A333D', muted: '#5D6F82', paper: '#E7EEF5' };
const LEFT = 18;
const WIDTH = 174;
const BOTTOM = 270;
const COLUMNS = 10;
const ROW = 15;
const HEADING = 20;

export interface ReportBlock {
  draw: DrawRecord;
  offset: number;
  numbers: number[];
  y: number;
}

/** Pagination preserves draw order, duplicates, and every position within a draw. */
export function planHistoryReport(history: DrawRecord[]): ReportBlock[][] {
  const pages: ReportBlock[][] = [[]];
  let y = 119;
  for (const draw of [...history].sort((a, b) => a.id - b.id)) {
    let offset = 0;
    while (offset < draw.numbers.length) {
      let rows = Math.floor((BOTTOM - y - HEADING) / ROW);
      if (rows < 1) { pages.push([]); y = 59; rows = Math.floor((BOTTOM - y - HEADING) / ROW); }
      const numbers = draw.numbers.slice(offset, offset + rows * COLUMNS);
      pages[pages.length - 1].push({ draw, offset, numbers, y });
      y += HEADING + Math.ceil(numbers.length / COLUMNS) * ROW + 14;
      offset += numbers.length;
    }
  }
  return pages;
}

function ordinal(id: number) {
  const tail = id % 100;
  const suffix = tail >= 11 && tail <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[id % 10] ?? 'th';
  return `${id}${suffix}`;
}

function timestamp(value: number) {
  return new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export interface ReportFonts { regular: string; medium: string }

export function buildHistoryPdf(snapshot: Snapshot, fonts: ReportFonts, exportedAt = Date.now()): Uint8Array {
  if (snapshot.activeDraw) throw new Error('Wait for the current draw to finish before exporting.');
  if (!snapshot.history.length) throw new Error('Draw some numbers before exporting this session.');
  const pages = planHistoryReport(snapshot.history);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('Aeonik-Regular.ttf', fonts.regular);
  pdf.addFont('Aeonik-Regular.ttf', 'Aeonik', 'normal');
  pdf.addFileToVFS('Aeonik-Medium.ttf', fonts.medium);
  pdf.addFont('Aeonik-Medium.ttf', 'Aeonik', 'bold');
  pdf.setProperties({ title: 'WhizReveal - Session report', author: 'WhizReveal by JAYCEE', subject: `Session ${snapshot.sessionId}`, creator: 'WhizReveal' });
  const total = snapshot.history.reduce((sum, draw) => sum + draw.numbers.length, 0);
  const unique = new Set(snapshot.history.flatMap(draw => draw.numbers)).size;
  const shortId = snapshot.sessionId.slice(0, 12);
  const text = (label: string, x: number, y: number, size = 10, color = COLORS.ink, bold = false, align: 'left' | 'center' | 'right' = 'left') => {
    pdf.setFont('Aeonik', bold ? 'bold' : 'normal');
    pdf.setFontSize(size); pdf.setTextColor(color); pdf.text(label, x, y, { align });
  };

  pages.forEach((blocks, pageIndex) => {
    if (pageIndex) pdf.addPage();
    pdf.setFillColor(COLORS.paper); pdf.rect(0, 0, 210, 297, 'F');
    pdf.setFillColor(COLORS.ink); pdf.roundedRect(LEFT, 18, WIDTH, 27, 3, 3, 'F');
    text('WhizReveal', 24, 30, 21, COLORS.paper, true);
    text('by JAYCEE', 24, 38, 8, COLORS.paper);
    text('Session report', 186, 30, 11, COLORS.paper, false, 'right');
    text(pageIndex ? 'Results continued' : 'Draw history', 186, 38, 8, COLORS.paper, false, 'right');

    if (pageIndex === 0) {
      text('SESSION', LEFT, 55, 8, COLORS.muted, true);
      pdf.setFontSize(9);
      const idLines = pdf.splitTextToSize(snapshot.sessionId, WIDTH) as string[];
      text(idLines.slice(0, 3).join('\n'), LEFT, 61, 9);
      text(`Exported ${timestamp(exportedAt)}`, LEFT, 78, 8, COLORS.muted);
      const stats = [[snapshot.config.totalSamples.toLocaleString('en-US'), 'Total samples'], [String(snapshot.history.length), 'Completed draws'], [total.toLocaleString('en-US'), 'Numbers recorded']];
      stats.forEach(([value, label], i) => {
        const x = LEFT + i * 60;
        text(value, x, 94, 23, COLORS.ink, true);
        text(label, x, 102, 9, COLORS.muted);
      });
      text(`${unique.toLocaleString('en-US')} unique numbers  /  Number pool 1-${snapshot.config.totalSamples.toLocaleString('en-US')}`, LEFT, 112, 9, COLORS.muted);
    }

    for (const { draw, offset, numbers, y } of blocks) {
      text(`${ordinal(draw.id)} Draw${offset ? ' / continued' : ''}`, LEFT, y + 4, 14, COLORS.ink, true);
      text(`${offset + 1}-${offset + numbers.length} of ${draw.numbers.length} numbers`, LEFT + WIDTH, y + 4, 8, COLORS.muted, false, 'right');
      text(timestamp(draw.createdAt), LEFT, y + 11, 8, COLORS.muted);
      pdf.setDrawColor(COLORS.line); pdf.setLineWidth(0.2); pdf.line(LEFT, y + 15, LEFT + WIDTH, y + 15);
      for (let start = 0; start < numbers.length; start += COLUMNS) {
        const row = numbers.slice(start, start + COLUMNS);
        const cellWidth = 15.6;
        const gap = 2;
        const rowWidth = row.length * cellWidth + (row.length - 1) * gap;
        row.forEach((number, col) => {
          const x = LEFT + (WIDTH - rowWidth) / 2 + col * (cellWidth + gap);
          const top = y + HEADING + Math.floor(start / COLUMNS) * ROW;
          pdf.setFillColor(COLORS.panel); pdf.roundedRect(x, top, cellWidth, 12, 1.6, 1.6, 'F');
          const digits = String(number).length;
          text(String(number), x + cellWidth / 2, top + 7.7, digits > 5 ? 8 : digits > 3 ? 10 : 13, COLORS.paper, true, 'center');
        });
      }
    }
    pdf.setDrawColor(COLORS.muted); pdf.setLineWidth(0.15); pdf.line(LEFT, 280, LEFT + WIDTH, 280);
    text(`Session ${shortId}  /  All times UTC`, LEFT, 286, 8, COLORS.muted);
    text(`${pageIndex + 1} / ${pages.length}`, LEFT + WIDTH, 286, 8, COLORS.muted, false, 'right');
  });
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('This report exceeds the 50 MB export limit.');
  return bytes;
}
