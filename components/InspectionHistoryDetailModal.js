'use client';

import Link from 'next/link';
import { defectLabel } from '../lib/constants';
import DefectMarkerOverlay from './DefectMarkerOverlay';
import ModalShell from './ModalShell';
import SignedImage from './SignedImage';

function StageBadge({ stage }) {
  const isRegular = stage === '초품' || stage === '중품' || stage === '종품';
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isRegular ? 'bg-accentSoft text-accent' : 'bg-surface2 text-muted'
      }`}
    >
      {stage}
    </span>
  );
}

function ResultBadge({ record }) {
  if (record.recordType === 'good') {
    return (
      <span className="inline-block rounded-full bg-goodSoft px-2 py-0.5 text-[10px] font-medium text-good">
        양품
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-[7rem] flex-col items-end gap-0.5">
      <span className="inline-block rounded-full bg-dangerSoft px-2 py-0.5 text-[10px] font-medium text-danger">
        불량
      </span>
      <span className="truncate text-[10px] text-danger">{defectLabel(record)}</span>
    </span>
  );
}

export default function InspectionHistoryDetailModal({ record, onClose }) {
  if (!record) return null;

  const isDefect = record.recordType === 'defect';
  const title = isDefect ? defectLabel(record) : '양품 기록';
  const aspectRatio =
    record.image_width > 0 && record.image_height > 0
      ? record.image_width / record.image_height
      : 4 / 3;

  return (
    <ModalShell
      title={title}
      eyebrow="자주검사 이력 상세"
      onClose={onClose}
      ariaLabel="자주검사 이력 상세"
      footer={
        isDefect ? (
          <div className="flex justify-end">
            <Link
              href="/defects"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:min-h-0"
            >
              불량기록에서 수정하기
            </Link>
          </div>
        ) : null
      }
    >
      <div className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={record.stage} />
          <ResultBadge record={record} />
        </div>

        <div
          className="relative mx-auto w-full overflow-hidden bg-surface2 md:rounded-xl"
          style={{ aspectRatio }}
        >
          {record.image_url ? (
            <>
              <SignedImage
                url={record.image_url}
                alt={title}
                fit="contain"
                sizes="(max-width: 768px) 100vw, 900px"
              />
              {isDefect ? (
                <DefectMarkerOverlay
                  markingData={record.marking_data}
                  imageWidth={record.image_width}
                  imageHeight={record.image_height}
                />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              이미지 없음
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted">작업자</div>
            <div className="font-medium text-text">{record.worker_name || '작업자 미상'}</div>
          </div>
          <div>
            <div className="text-xs text-muted">촬영시각</div>
            <div className="font-medium text-text">
              {record.created_at ? new Date(record.created_at).toLocaleString('ko-KR') : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">검사 단계</div>
            <div className="font-medium text-text">{record.stage}</div>
          </div>
          <div>
            <div className="text-xs text-muted">근무조</div>
            <div className="font-medium text-text">
              {record.shift === 'day' ? '주간' : record.shift === 'night' ? '야간' : '미정'}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export { StageBadge, ResultBadge };
