import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface XlsxRendererProps {
  url: string;
}

interface SheetData {
  name: string;
  rows: unknown[][];
}

const MAX_ROWS = 1000;

function normalizeRowValues(values: unknown): unknown[] {
  if (!Array.isArray(values)) return [];
  return values;
}

export function XlsxRenderer({ url }: XlsxRendererProps) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const blob = new Blob([arrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const { default: readXlsxFile, readSheetNames } = await import('read-excel-file/browser');
        const sheetNames = await readSheetNames(blob);
        const parsed: SheetData[] = await Promise.all(
          sheetNames.map(async (sheetName) => ({
            name: sheetName,
            rows: (await readXlsxFile(blob, { sheet: sheetName })).map((row) => normalizeRowValues(row)),
          }))
        );
        if (!cancelled) setSheets(parsed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [url]);

  if (error) {
    return <div className="p-4 text-sm text-error">{error}</div>;
  }

  if (sheets === null) {
    return (
      <div className="flex items-center justify-center p-8 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  const current = sheets[activeSheet];
  if (!current) return null;

  const displayRows = current.rows.slice(0, MAX_ROWS);
  const truncated = current.rows.length > MAX_ROWS;

  return (
    <div className="flex flex-col h-full">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-border bg-surface-muted overflow-x-auto">
          {sheets.map((sheet, i) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(i)}
              className={`px-2 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                i === activeSheet
                  ? 'bg-accent text-white'
                  : 'hover:bg-surface-hover text-text-secondary'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-2">
        <table className="w-full text-xs border-collapse">
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'font-semibold bg-surface-muted' : 'border-t border-border'}>
                {(row as unknown[]).map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 whitespace-nowrap">
                    {cell != null ? String(cell) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && (
          <p className="text-xs text-text-muted text-center py-2">
            Showing first {MAX_ROWS} of {current.rows.length} rows
          </p>
        )}
      </div>
    </div>
  );
}
