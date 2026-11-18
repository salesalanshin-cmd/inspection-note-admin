import { CONFIDENCE_LABELS, getCodeLabel } from '../lib/constants';
import { formatMisdiagnosisBannerLine } from '../lib/aiCorrectionSelect';

export function SimilarCorrectionNotes({
  codeSet,
  items,
  suggestedCode,
  productName,
}) {
  if (!items?.length && !suggestedCode) return null;

  const productScoped = Boolean(String(productName || '').trim());
  const summary = formatMisdiagnosisBannerLine(suggestedCode, items, {
    productScoped,
  });

  if (!summary && !items?.length) return null;

  return (
    <div className="space-y-1">
      {summary ? (
        <p className="break-words text-[11px] font-medium leading-relaxed text-warn">
          {summary}
        </p>
      ) : null}
      {(items || []).map((row) => {
        const label = getCodeLabel(codeSet, row.finalCode) || row.finalCode;
        const productCount = Number(row.sameProductCount) || 0;
        return (
          <p
            key={row.finalCode}
            className="break-words text-[11px] leading-relaxed text-muted"
          >
            과거 유사 사례에서 사용자가 {label}로 정정함 ({row.count}건
            {productScoped ? `, 같은 제품 ${productCount}건` : ''})
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
  needsReview,
  productName,
}) {
  if (!code) {
    return (
      <div className="rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
        <span className="text-accent font-medium">✦ AI 제안:</span> 적합한 코드를 찾지 못했습니다.
        {reason ? ` (${reason})` : ''}
        {similarCorrections?.length ? (
          <div className="mt-1.5">
            <SimilarCorrectionNotes
              codeSet={codeSet}
              items={similarCorrections}
              suggestedCode={null}
              productName={productName}
            />
          </div>
        ) : null}
      </div>
    );
  }

  const label = getCodeLabel(codeSet, code);
  const confLabel = CONFIDENCE_LABELS[confidence] || confidence;

  return (
    <div
      className={`rounded-xl px-3 py-2 text-xs ${
        needsReview ? 'border border-warn/40 bg-warnSoft' : 'bg-accentSoft'
      }`}
    >
      <span className="font-medium text-accent">✦ AI 제안:</span>{' '}
      <span className="text-text">
        {code} ({label})
      </span>
      <span className="text-muted">
        {' '}
        · 확신도: {confLabel}
        {reason ? ` · ${reason}` : ''}
      </span>
      {needsReview ? (
        <span className="ml-1.5 inline-flex rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
          확인 필요
        </span>
      ) : null}
      {similarCorrections?.length ? (
        <div className="mt-1.5">
          <SimilarCorrectionNotes
            codeSet={codeSet}
            items={similarCorrections}
            suggestedCode={code}
            productName={productName}
          />
        </div>
      ) : null}
    </div>
  );
}
