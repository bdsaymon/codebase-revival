import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';

export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const input = String(raw || '').replace(/\r\n/g, '\n');

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      if (row.some((c) => c !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c !== '')) {
    rows.push(row);
  }
  return rows;
}

export const CsvTablePreview: React.FC<{ content: string }> = ({ content }) => {
  const [query, setQuery] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const parsed = useMemo(() => parseCsvRows(content), [content]);
  const headers = parsed[0] || [];
  const dataRows = parsed.slice(1);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? dataRows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)))
      : dataRows;
    if (sortCol === null) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a[sortCol] ?? '').trim();
      const bv = (b[sortCol] ?? '').trim();
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') {
        return sortAsc ? an - bn : bn - an;
      }
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [dataRows, query, sortCol, sortAsc]);

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(colIdx);
      setSortAsc(true);
    }
  };

  if (headers.length === 0) {
    return (
      <div className="p-6 text-xs text-[var(--ink-dim)]">Empty CSV file.</div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-[var(--surface)]" data-testid="csv-table-preview">
      <div className="px-3 py-2 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-2)]/50">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter CSV rows..."
            className="w-full pl-8 pr-3 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <span className="text-[11px] font-mono text-[var(--ink-dim)]">
          {filteredAndSorted.length} / {dataRows.length} rows · {headers.length} columns
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)] border-b border-[var(--border)]">
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="px-3 py-2 font-semibold text-[var(--ink)] border-r border-[var(--border)]/60 cursor-pointer select-none whitespace-nowrap hover:bg-[var(--surface-3)]"
                >
                  <span className="inline-flex items-center gap-1">
                    <span>{h}</span>
                    {sortCol === i &&
                      (sortAsc ? (
                        <ArrowUp className="w-3 h-3 text-[var(--primary)]" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-[var(--primary)]" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/60">
            {filteredAndSorted.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-[var(--surface-2)]/50 transition-colors"
              >
                {headers.map((_, cIdx) => (
                  <td
                    key={cIdx}
                    className="px-3 py-1.5 text-[var(--text)] border-r border-[var(--border)]/40 align-top"
                  >
                    {row[cIdx] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
