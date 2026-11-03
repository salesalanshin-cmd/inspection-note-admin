import { LIST_TRUNCATION_MESSAGE } from '../lib/listPages';

export default function ListTruncationNotice({ show }) {
  if (!show) return null;
  return (
    <p className="rounded-xl border border-warn/30 bg-warnSoft px-4 py-3 text-sm text-warn">
      {LIST_TRUNCATION_MESSAGE}
    </p>
  );
}
