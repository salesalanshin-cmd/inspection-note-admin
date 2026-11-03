import { CONFIDENCE_LABELS, getCodeLabel } from '../lib/constants';

export function SimilarCorrectionNotes({ codeSet, items }) {
  if (!items?.length) return null;
  return (
    <div className="space-y-1">
      {items.map((row) => {
        const label = getCodeLabel(codeSet, row.finalCode) || row.finalCode;
        return (
          <p
            key={row.finalCode}
            className="break-words text-[11px] leading-relaxed text-muted"
          >
            과거 유사 사례에서 사용자가 {label}로 정정함 ({row.count}건, 같은 제품{' '}
            {row.sameProductCount}건)
          </p>
        );
      })}
    </div>
  );
}

export default function AiSuggestionBanner({
  code,
  confidence,
  reason,
  codeSet,
  similarCorrections,
}) {
  if (!code) {
    return (
      <div className="rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
        <span className="text-accent font-medium">✦ AI 제안:</span> 적합한 코드를 찾지 못했습니다.
        {reason ? ` (${reason})` : ''}
        {similarCorrections?.length ? (
          <div className="mt-1.5">
            <SimilarCorrectionNotes codeSet={codeSet} items={similarCorrections} />
          </div>
        ) : null}
      </div>
    );
  }

  const label = getCodeLabel(codeSet, code);
  const confLabel = CONFIDENCE_LABELS[confidence] || confidence;

  return (
    <div className="rounded-xl bg-accentSoft px-3 py-2 text-xs">
      <span className="font-medium text-accent">✦ AI 제안:</span>{' '}
      <span className="text-text">
        {code} ({label})
      </span>
      <span className="text-muted">
        {' '}
        · 확신도: {confLabel}
        {reason ? ` · ${reason}` : ''}
      </span>
      {similarCorrections?.length ? (
        <div className="mt-1.5">
          <SimilarCorrectionNotes codeSet={codeSet} items={similarCorrections} />
        </div>
      ) : null}
    </div>
  );
}
