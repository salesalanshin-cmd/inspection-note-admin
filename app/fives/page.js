'use client';

import { useReports } from '../../lib/useReports';
import PageHeader from '../../components/PageHeader';
import SignedImage from '../../components/SignedImage';

export default function FivesPage() {
  const { loading, error, fives } = useReports();

  if (loading) return <div className="p-8 text-muted font-mono text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger font-mono text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader eyebrow="WORKPLACE" title="3정5S 기록" description={`총 ${fives.length}건`} />

      <div className="p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {fives.map((f) => (
            <div key={f.id} className="bg-surface border border-border rounded-sm overflow-hidden">
              <div className="relative aspect-square bg-surface2">
                {f.image_url ? (
                  <SignedImage url={f.image_url} alt={f.area_type || '3정5S'} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted text-xs font-mono">
                    이미지 없음
                  </div>
                )}
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-accent/90 text-bg text-[10px] font-mono rounded-sm">
                  {f.area_type || '구역 미상'}
                </div>
              </div>
              <div className="p-2.5 text-xs">
                <div className="text-text font-medium">{f.worker_name || '작업자 미상'}</div>
                {f.description ? <div className="text-muted mt-0.5">{f.description}</div> : null}
                <div className="text-muted font-mono mt-0.5">
                  {f.created_at ? new Date(f.created_at).toLocaleString('ko-KR') : ''}
                </div>
              </div>
            </div>
          ))}
          {fives.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted font-mono text-xs">
              기록이 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
