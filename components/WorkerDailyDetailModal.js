'use client';

import { useMemo } from 'react';
import { fivesErrorCode } from '../lib/constants';
import { recordsForWorkerInWorkRange, tagInspectionStage } from '../lib/analytics';
import ModalShell from './ModalShell';
import SignedImage from './SignedImage';
import { ResultBadge, StageBadge } from './InspectionHistoryDetailModal';

function formatWorkDateTitle(date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function FrequentRecordCard({ record }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square bg-surface2">
        <div className="absolute left-1.5 top-1.5 z-20">
          <StageBadge stage={record.stage} />
        </div>
        <div className="absolute right-1.5 top-1.5 z-20">
          <ResultBadge record={record} />
        </div>
        {record.image_url ? (
          <SignedImage
            url={record.image_url}
            alt={record.recordType === 'defect' ? '불량' : '양품'}
            sizes="(max-width: 768px) 50vw, 200px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">
            이미지 없음
          </div>
        )}
      </div>
      <div className="p-2 text-[10px] text-muted md:text-xs">
        {record.created_at ? new Date(record.created_at).toLocaleString('ko-KR') : ''}
      </div>
    </div>
  );
}

function FivesRecordCard({ record }) {
  const errorCode = fivesErrorCode(record);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square bg-surface2">
        {record.image_url ? (
          <SignedImage
            url={record.image_url}
            alt={record.area_type || '3정5S'}
            sizes="(max-width: 768px) 50vw, 200px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">
            이미지 없음
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5 right-1.5 z-20 flex flex-wrap gap-1">
          {record.area_type ? (
            <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-medium text-accent">
              {record.area_type}
            </span>
          ) : null}
          {errorCode ? (
            <span className="rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
              {errorCode}
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-2 text-[10px] text-muted md:text-xs">
        {record.created_at ? new Date(record.created_at).toLocaleString('ko-KR') : ''}
      </div>
    </div>
  );
}

export default function WorkerDailyDetailModal({
  workerName,
  defects,
  goods,
  fives,
  workerDirectory,
  date,
  onClose,
}) {
  const frequentRecords = useMemo(() => {
    const combined = [
      ...(defects || []).map((r) => ({ ...r, recordType: 'defect' })),
      ...(goods || []).map((r) => ({ ...r, recordType: 'good' })),
    ];
    const workerRecords = combined.filter((r) => r.worker_name === workerName);
    const dayRecords = [
      ...recordsForWorkerInWorkRange(defects, workerName, date).map((r) => ({
        ...r,
        recordType: 'defect',
      })),
      ...recordsForWorkerInWorkRange(goods, workerName, date).map((r) => ({
        ...r,
        recordType: 'good',
      })),
    ];
    return dayRecords
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((r) => {
        const { stage } = tagInspectionStage(r, workerDirectory, workerRecords);
        return { ...r, stage, listKey: `${r.recordType}-${r.id}` };
      });
  }, [defects, goods, workerName, date, workerDirectory]);

  const fivesRecords = useMemo(
    () =>
      recordsForWorkerInWorkRange(fives, workerName, date).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      ),
    [fives, workerName, date]
  );

  const title = `${workerName}님의 ${formatWorkDateTitle(date)} 실적`;

  return (
    <ModalShell
      title={title}
      onClose={onClose}
      ariaLabel={title}
      maxWidthClass="md:max-w-2xl"
      maxHeightClass="md:max-h-[80vh]"
    >
      <div className="space-y-6 p-4 md:p-5">
        <section>
          <h3 className="mb-3 text-sm font-medium text-text">자주검사</h3>
          {frequentRecords.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {frequentRecords.map((record) => (
                <FrequentRecordCard key={record.listKey} record={record} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">자주검사 기록이 없습니다</p>
          )}
        </section>

        <section className="border-t border-border pt-6">
          <h3 className="mb-3 text-sm font-medium text-text">3정5S</h3>
          {fivesRecords.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {fivesRecords.map((record) => (
                <FivesRecordCard key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">3정5S 기록이 없습니다</p>
          )}
        </section>
      </div>
    </ModalShell>
  );
}
