import { CONFIDENCE_LABELS, getCodeLabel } from '../lib/constants';

export default function AiSuggestionBanner({ code, confidence, reason, codeSet }) {
  if (!code) {
    return (
      <div className="rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
        <span className="text-accent font-medium">✦ AI 제안:</span> 적합한 코드를 찾지 못했습니다.
        {reason ? ` (${reason})` : ''}
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
    </div>
  );
}
