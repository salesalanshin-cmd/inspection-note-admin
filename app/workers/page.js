'use client';

import { useReports } from '../../lib/useReports';
import { buildWorkerStats } from '../../lib/analytics';
import { INSPECTION_CYCLE_DAYS, FIVES_CYCLE_DAYS } from '../../lib/constants';
import PageHeader from '../../components/PageHeader';

function fmtDate(d) {
  if (!d) return '기록 없음';
  return new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

function Badge({ ok, okLabel, badLabel }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-mono border ${
        ok
          ? 'border-good/40 text-good bg-good/10'
          : 'border-danger/40 text-danger bg-danger/10'
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default function WorkersPage() {
  const { loading, error, defects, goods, fives } = useReports();

  if (loading) return <div className="p-8 text-muted font-mono text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger font-mono text-sm">오류: {error}</div>;

  const workers = buildWorkerStats(defects, goods, fives);
  const alertTargets = workers.filter((w) => w.needsAlert);

  return (
    <div>
      <PageHeader
        eyebrow="WORKERS"
        title="작업자 현황"
        description={`정기검사 기준 ${INSPECTION_CYCLE_DAYS}일 · 3정5S 기준 ${FIVES_CYCLE_DAYS}일. 기준일 초과 시 미준수로 표시됩니다.`}
      />

      <div className="p-8 space-y-6">
        {alertTargets.length > 0 && (
          <div className="bg-danger/10 border border-danger/30 rounded-sm p-4">
            <div className="text-sm text-danger font-medium mb-1">
              알림 발송 대상 {alertTargets.length}명
            </div>
            <div className="text-xs text-muted font-mono">
              {alertTargets.map((w) => w.worker_name).join(' · ')}
            </div>
          </div>
        )}

        <div className="bg-surface border border-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] tracking-[0.15em] text-muted font-mono uppercase">
                <th className="px-4 py-3">작업자</th>
                <th className="px-4 py-3">불량</th>
                <th className="px-4 py-3">양품</th>
                <th className="px-4 py-3">불량률</th>
                <th className="px-4 py-3">3정5S</th>
                <th className="px-4 py-3">최근 검사</th>
                <th className="px-4 py-3">최근 3정5S</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.worker_name} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-text font-medium">{w.worker_name}</td>
                  <td className="px-4 py-3 text-danger font-mono">{w.defectCount}</td>
                  <td className="px-4 py-3 text-good font-mono">{w.goodCount}</td>
                  <td className="px-4 py-3 font-mono text-muted">
                    {(w.defectRate * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{w.fivesCount}</td>
                  <td className="px-4 py-3 font-mono text-muted">{fmtDate(w.lastInspectionAt)}</td>
                  <td className="px-4 py-3 font-mono text-muted">{fmtDate(w.lastFivesAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Badge ok={!w.inspectionOverdue} okLabel="검사 정상" badLabel="검사 지연" />
                      <Badge ok={!w.fivesOverdue} okLabel="5S 정상" badLabel="5S 지연" />
                    </div>
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted font-mono text-xs">
                    기록된 작업자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          ※ 작업자 마스터 테이블이 별도로 없어, 한 번이라도 기록을 남긴 작업자만 표시됩니다. 아직 앱을
          사용하지 않은 신규 작업자는 여기 나타나지 않습니다.
        </p>
      </div>
    </div>
  );
}
