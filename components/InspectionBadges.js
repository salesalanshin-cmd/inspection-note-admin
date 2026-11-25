import { defectLabel, SHIFT_STAGES } from '../lib/constants';

const badge = 'max-w-full rounded-xl px-2 py-0.5 text-xs font-semibold leading-5';

export default function InspectionBadges({ record, className = '' }) {
  const isDefect = record.recordType === 'defect';
  const stageColor = SHIFT_STAGES.includes(record.stage)
    ? 'bg-accentSoft text-accent'
    : 'bg-surface2 text-muted';
  const resultColor = isDefect ? 'bg-dangerSoft text-danger' : 'bg-goodSoft text-good';

  return (
    <div className={`inspection-badges flex flex-wrap items-center gap-1 ${className}`}>
      <span className={`${badge} whitespace-nowrap ${stageColor}`}>{record.stage}</span>
      <span className={`${badge} whitespace-nowrap ${resultColor}`}>{isDefect ? '불량' : '양품'}</span>
      {isDefect && (
        <span className={`${badge} text-left [overflow-wrap:anywhere] ${resultColor}`}>
          {defectLabel(record)}
        </span>
      )}
    </div>
  );
}
