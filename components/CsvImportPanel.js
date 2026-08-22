'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { parseCsv } from '../lib/parseCsv';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string[]} props.expectedHeaders
 * @param {string} props.headerHelp
 * @param {(row: Record<string, string>) => { valid: boolean, errors?: string[] }} props.validateRow
 * @param {(rows: Record<string, string>[]) => Promise<{ ok: boolean, skipped?: number }>} props.onImport
 * @param {boolean} [props.disabled]
 */
export default function CsvImportPanel({
  title,
  expectedHeaders,
  headerHelp,
  validateRow,
  onImport,
  disabled = false,
}) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    setResult(null);
    if (!file) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const { headers, rows } = parseCsv(text);
      const evaluated = rows.map((row, index) => {
        const { valid, errors = [] } = validateRow(row);
        return { index, row, valid, errors };
      });
      setPreview({ headers, evaluated });
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  async function handleImport() {
    if (!preview) return;
    const validRows = preview.evaluated.filter((item) => item.valid).map((item) => item.row);
    if (!validRows.length) return;

    setImporting(true);
    setResult(null);
    const outcome = await onImport(validRows);
    setImporting(false);
    if (outcome.ok) {
      setResult({
        type: 'success',
        message: `${validRows.length}건 등록, ${preview.evaluated.length - validRows.length}건 건너뜀`,
      });
      setPreview(null);
    } else {
      setResult({ type: 'error', message: outcome.message ?? '등록 실패' });
    }
  }

  const validCount = preview?.evaluated.filter((item) => item.valid).length ?? 0;
  const skipCount = preview ? preview.evaluated.length - validCount : 0;

  return (
    <div className="rounded-xl border border-border bg-surface2/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">{title}</p>
          <p className="mt-1 text-xs text-muted">{headerHelp}</p>
          <p className="mt-1 font-mono text-[11px] text-muted">{expectedHeaders.join(', ')}</p>
        </div>
        <button
          type="button"
          disabled={disabled || importing}
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0"
        >
          <Upload className="h-4 w-4" strokeWidth={2} />
          CSV 선택
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[32rem] text-xs">
              <thead>
                <tr className="border-b border-border bg-surface2 text-left text-muted">
                  <th className="px-3 py-2">#</th>
                  {expectedHeaders.map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {preview.evaluated.map(({ index, row, valid, errors }) => (
                  <tr
                    key={index}
                    className={`border-b border-border last:border-0 ${valid ? '' : 'bg-dangerSoft/60'}`}
                  >
                    <td className="px-3 py-2 text-muted">{index + 1}</td>
                    {expectedHeaders.map((h) => (
                      <td key={h} className="px-3 py-2">
                        {row[h] ?? ''}
                      </td>
                    ))}
                    <td className={`px-3 py-2 ${valid ? 'text-good' : 'text-danger'}`}>
                      {valid ? '등록 가능' : errors.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={disabled || importing || validCount === 0}
              onClick={handleImport}
              className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
            >
              {importing ? '등록 중…' : `${validCount}건 등록 (${skipCount}건 건너뜀)`}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => setPreview(null)}
              className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 md:min-h-0"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${
            result.type === 'success' ? 'bg-goodSoft text-good' : 'bg-dangerSoft text-danger'
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}

export { inputClass };
