'use client';

import { useEffect, useState } from 'react';

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

/**
 * 엑셀 업로드 옵션 — 시트별 table/flow 모드 + 제외 + 미리보기
 *
 * value: {
 *   sheetNames: string[],
 *   sheetModes: Record<string, 'table'|'flow'>,
 *   useRecommended?: boolean,
 * }
 */
export default function ExcelUploadOptions({ file, value, onChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/documents/xlsx-preview', {
          method: 'POST',
          body: form,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '미리보기 실패');
        if (cancelled) return;
        setPreview(json);

        const allSheets = json.sheetNames || [];
        const sheetModes = { ...(value.sheetModes || {}) };
        for (const s of json.sheets || []) {
          if (!sheetModes[s.name]) {
            sheetModes[s.name] = s.recommendedMode || 'table';
          }
        }
        onChange({
          ...value,
          sheetNames: value.sheetNames?.length ? value.sheetNames : allSheets,
          sheetModes,
          useRecommended: false,
        });
        if (allSheets[0]) setExpanded(allSheets[0]);
      } catch (err) {
        if (!cancelled) setError(err.message || '미리보기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function applyRecommended() {
    if (!preview?.sheets) return;
    const sheetModes = {};
    const sheetNames = [];
    for (const s of preview.sheets) {
      sheetModes[s.name] = s.recommendedMode || 'table';
      sheetNames.push(s.name);
    }
    onChange({
      ...value,
      sheetNames,
      sheetModes,
      useRecommended: false,
    });
  }

  function toggleInclude(name) {
    const current = new Set(value.sheetNames || []);
    if (current.has(name)) current.delete(name);
    else current.add(name);
    onChange({ ...value, sheetNames: [...current], useRecommended: false });
  }

  function setMode(name, mode) {
    onChange({
      ...value,
      sheetModes: { ...(value.sheetModes || {}), [name]: mode },
      useRecommended: false,
    });
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-border bg-surface2/60 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-text">엑셀 파싱 옵션</p>
          <p className="mt-0.5 text-[11px] text-muted">
            table = 기준서(표) · flow = 프로세스/규정. 추천은 참고용이며 직접 바꿀 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={applyRecommended}
          disabled={!preview || loading}
          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text hover:bg-surface2 disabled:opacity-50"
        >
          추천값으로 맞추기
        </button>
      </div>

      {loading ? <p className="text-xs text-muted">미리보기 불러오는 중…</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {preview ? (
        <div className="space-y-2">
          {(preview.sheets || []).map((sheet) => {
            const included = (value.sheetNames || []).includes(sheet.name);
            const mode = value.sheetModes?.[sheet.name] || sheet.recommendedMode || 'table';
            const open = expanded === sheet.name;
            return (
              <div
                key={sheet.name}
                className={`rounded-lg border ${included ? 'border-border bg-surface' : 'border-dashed border-border/60 bg-surface2/40 opacity-70'}`}
              >
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-text">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => toggleInclude(sheet.name)}
                    />
                    포함
                  </label>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-text"
                    onClick={() => setExpanded(open ? null : sheet.name)}
                  >
                    {sheet.name}
                    <span className="ml-2 font-normal text-muted">
                      추천 {sheet.recommendedMode === 'flow' ? 'flow' : 'table'}
                      {sheet.metaText ? ` · ${sheet.metaText.slice(0, 40)}` : ''}
                    </span>
                  </button>
                  <select
                    disabled={!included}
                    value={mode}
                    onChange={(e) => setMode(sheet.name, e.target.value)}
                    className={`${inputClass} w-auto min-w-[7rem] py-1 text-xs`}
                  >
                    <option value="table">table (표)</option>
                    <option value="flow">flow (서술)</option>
                  </select>
                </div>
                {open && included ? (
                  <div className="border-t border-border px-3 py-2">
                    {sheet.metaText ? (
                      <p className="mb-2 text-[11px] text-muted">메타: {sheet.metaText}</p>
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-[11px]">
                        <thead className="bg-surface2 text-left text-muted">
                          <tr>
                            <th className="px-2 py-1 font-medium">행</th>
                            {(sheet.headers || []).slice(0, 8).map((h) => (
                              <th
                                key={h}
                                className="whitespace-nowrap px-2 py-1 font-medium"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(sheet.previewRows || []).slice(0, 5).map((row) => (
                            <tr key={row.excelRow}>
                              <td className="px-2 py-1 text-muted">{row.excelRow}</td>
                              {(row.values || []).slice(0, 8).map((v, i) => (
                                <td
                                  key={`${row.excelRow}-${i}`}
                                  className="max-w-[120px] truncate px-2 py-1"
                                >
                                  {v}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
