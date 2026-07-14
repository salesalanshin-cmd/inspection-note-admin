'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { defectLabel } from '../lib/constants';
import { getDisplayName, groupWorkerRecordsByDate, tagInspectionStage } from '../lib/analytics';
import {
  buildImageDownloadFilename,
  downloadRecordImage,
} from '../lib/downloadImages';
import DefectMarkerOverlay from './DefectMarkerOverlay';
import ModalShell from './ModalShell';
import SignedImage from './SignedImage';
import ImageZoom from './ImageZoom';
import { ResultBadge, StageBadge } from './InspectionHistoryDetailModal';

function formatDateListLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const monthDay = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  return `${monthDay} 근무일`;
}

function enrichRecord(record, workerDirectory, allWorkerRecords) {
  const recordType = record.recordType === 'good' ? 'good' : 'defect';
  const { stage, shift } = tagInspectionStage(record, workerDirectory, allWorkerRecords);
  return {
    ...record,
    recordType,
    stage,
    shift,
    listKey: `${recordType}-${record.id}`,
  };
}

export default function WorkerHistoryModal({ workerName, defects, goods, workerDirectory, onClose }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  const combinedRecords = useMemo(
    () => [
      ...(defects || []).map((r) => ({ ...r, recordType: 'defect' })),
      ...(goods || []).map((r) => ({ ...r, recordType: 'good' })),
    ],
    [defects, goods]
  );

  const dateGroups = useMemo(
    () => groupWorkerRecordsByDate(combinedRecords, workerName),
    [combinedRecords, workerName]
  );

  const workerRecords = useMemo(
    () => combinedRecords.filter((r) => r.worker_name === workerName),
    [combinedRecords, workerName]
  );

  const dayRecords = useMemo(() => {
    if (!selectedDate) return [];
    const group = dateGroups.find((g) => g.date === selectedDate);
    return (group?.records || []).map((r) => enrichRecord(r, workerDirectory, workerRecords));
  }, [dateGroups, selectedDate, workerDirectory, workerRecords]);

  const previewItem = previewRecord
    ? enrichRecord(previewRecord, workerDirectory, workerRecords)
    : null;
  const isDefectPreview = previewItem?.recordType === 'defect';

  function handleBack() {
    if (previewRecord) {
      setPreviewRecord(null);
      setDownloadError(null);
      return;
    }
    setSelectedDate(null);
  }

  async function handleDownloadPreview() {
    if (!previewItem?.image_url) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadRecordImage({
        imageUrl: previewItem.image_url,
        filename: buildImageDownloadFilename(
          getDisplayName(workerName, workerDirectory),
          previewItem.created_at
        ),
        ...(isDefectPreview ? { bucket: 'defect-images' } : {}),
      });
    } catch (err) {
      setDownloadError(err.message || '이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  const showBack = Boolean(selectedDate || previewRecord);
  const displayName = getDisplayName(workerName, workerDirectory);
  const title = `${displayName}님의 자주검사 이력`;

  return (
    <ModalShell
      title={title}
      onClose={onClose}
      ariaLabel={title}
      maxWidthClass="md:max-w-2xl"
      maxHeightClass="md:max-h-[80vh]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {showBack ? (
          <div className="shrink-0 border-b border-border px-4 py-2 md:px-5">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex min-h-[40px] items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              {previewRecord ? '사진 목록으로' : '날짜 목록으로'}
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {!selectedDate && !previewRecord ? (
            <ul className="space-y-2">
              {dateGroups.map((group) => (
                <li key={group.date}>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(group.date)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition-colors hover:bg-surface2"
                  >
                    <span className="font-medium text-text">
                      {formatDateListLabel(group.date)} - {group.count}건
                    </span>
                    <span className="text-xs text-muted">보기</span>
                  </button>
                </li>
              ))}
              {dateGroups.length === 0 ? (
                <li className="py-12 text-center text-xs text-muted">촬영 기록이 없습니다</li>
              ) : null}
            </ul>
          ) : null}

          {selectedDate && !previewRecord ? (
            <>
              <p className="mb-3 text-xs text-muted">
                {formatDateListLabel(selectedDate)} · {dayRecords.length}건
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dayRecords.map((r) => (
                  <button
                    key={r.listKey}
                    type="button"
                    onClick={() => setPreviewRecord(r)}
                    className="group overflow-hidden rounded-xl border border-border bg-surface text-left transition-colors hover:border-accent/40"
                  >
                    <div className="relative aspect-square bg-surface2">
                      <div className="absolute left-1.5 top-1.5 z-20">
                        <StageBadge stage={r.stage} />
                      </div>
                      <div className="absolute right-1.5 top-1.5 z-20">
                        <ResultBadge record={r} />
                      </div>
                      {r.image_url ? (
                        <SignedImage
                          url={r.image_url}
                          alt={r.recordType === 'defect' ? defectLabel(r) : '양품'}
                          sizes="(max-width: 768px) 50vw, 200px"
                          bucket={r.recordType === 'defect' ? 'defect-images' : undefined}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">
                          이미지 없음
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-[10px] text-muted md:text-xs">
                      {r.created_at ? new Date(r.created_at).toLocaleTimeString('ko-KR') : ''}
                    </div>
                  </button>
                ))}
                {dayRecords.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-xs text-muted">
                    이 날짜의 기록이 없습니다
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {previewItem ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StageBadge stage={previewItem.stage} />
                <ResultBadge record={previewItem} />
              </div>
              <div
                className="relative mx-auto w-full overflow-hidden bg-surface2 md:rounded-xl"
                style={{
                  aspectRatio:
                    previewItem.image_width > 0 && previewItem.image_height > 0
                      ? previewItem.image_width / previewItem.image_height
                      : 4 / 3,
                }}
              >
                {previewItem.image_url ? (
                  <ImageZoom
                    url={previewItem.image_url}
                    alt={isDefectPreview ? defectLabel(previewItem) : '양품'}
                    fit="contain"
                    sizes="(max-width: 768px) 100vw, 640px"
                    bucket={isDefectPreview ? 'defect-images' : undefined}
                  >
                    {isDefectPreview ? (
                      <DefectMarkerOverlay
                        markingData={previewItem.marking_data}
                        imageWidth={previewItem.image_width}
                        imageHeight={previewItem.image_height}
                      />
                    ) : null}
                  </ImageZoom>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                    이미지 없음
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  {previewItem.created_at
                    ? new Date(previewItem.created_at).toLocaleString('ko-KR')
                    : ''}
                </p>
                {previewItem.image_url ? (
                  <button
                    type="button"
                    onClick={handleDownloadPreview}
                    disabled={downloading}
                    className="min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0"
                  >
                    {downloading ? '다운로드 중...' : '이미지 다운로드'}
                  </button>
                ) : null}
              </div>
              {downloadError ? (
                <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">
                  {downloadError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
