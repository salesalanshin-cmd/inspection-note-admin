'use client';

import { useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import { defectLabel } from '../../lib/constants';
import PageHeader from '../../components/PageHeader';
import SignedImage from '../../components/SignedImage';
import EditDefectModal from '../../components/EditDefectModal';

export default function DefectsPage() {
  const { loading, error, defects, refetch } = useReports();
  const [worker, setWorker] = useState('all');
  const [type, setType] = useState('all');
  const [editing, setEditing] = useState(null);

  const workers = useMemo(
    () => Array.from(new Set(defects.map((d) => d.worker_name).filter(Boolean))).sort(),
    [defects]
  );
  const types = useMemo(
    () => Array.from(new Set(defects.map((d) => defectLabel(d)))).sort(),
    [defects]
  );

  const filtered = defects.filter(
    (d) => (worker === 'all' || d.worker_name === worker) && (type === 'all' || defectLabel(d) === type)
  );

  if (loading) return <div className="p-8 text-muted font-mono text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger font-mono text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader eyebrow="RECORDS" title="불량 기록" description={`총 ${filtered.length}건`} />

      <div className="p-8 space-y-6">
        <div className="flex gap-3">
          <select
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
            className="bg-surface border border-border text-sm text-text px-3 py-2 rounded-sm font-mono focus:outline-none focus:border-accent"
          >
            <option value="all">전체 작업자</option>
            {workers.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-surface border border-border text-sm text-text px-3 py-2 rounded-sm font-mono focus:outline-none focus:border-accent"
          >
            <option value="all">전체 유형</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((d) => (
            <div key={d.id} className="bg-surface border border-border rounded-sm overflow-hidden group">
              <div className="relative aspect-square bg-surface2">
                {d.image_url ? (
                  <SignedImage url={d.image_url} alt={defectLabel(d)} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted text-xs font-mono">
                    이미지 없음
                  </div>
                )}
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-danger/90 text-white text-[10px] font-mono rounded-sm">
                  {defectLabel(d)}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(d)}
                  title="불량 유형 수정"
                  aria-label="불량 유형 수정"
                  className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface/90 text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </div>
              <div className="p-2.5 text-xs">
                <div className="text-text font-medium">{d.worker_name || '작업자 미상'}</div>
                <div className="text-muted font-mono mt-0.5">
                  {d.created_at ? new Date(d.created_at).toLocaleString('ko-KR') : ''}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted font-mono text-xs">
              조건에 맞는 기록이 없습니다
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditDefectModal
          report={editing}
          onClose={() => setEditing(null)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}
