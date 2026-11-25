'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import { ACTION_FEEDBACK_EVENT } from '../lib/actionFeedback';

const appearances = {
  success: { Icon: CheckCircle2, color: 'text-emerald-300' },
  error: { Icon: CircleAlert, color: 'text-red-300' },
  warning: { Icon: TriangleAlert, color: 'text-amber-300' },
};

export default function ActionToast() {
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let timer;
    let sequence = 0;
    function show({ detail }) {
      window.clearTimeout(timer);
      setNotice({ ...detail, id: ++sequence });
      timer = window.setTimeout(() => setNotice(null), 2000);
    }
    window.addEventListener(ACTION_FEEDBACK_EVENT, show);
    return () => {
      window.removeEventListener(ACTION_FEEDBACK_EVENT, show);
      window.clearTimeout(timer);
    };
  }, []);

  const { Icon, color } = appearances[notice?.tone] || appearances.success;
  return (
    <div role="status" aria-live="polite" aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[12000] flex justify-center px-4 print:hidden">
      {notice && (
        <div key={notice.id} data-action-toast={notice.tone}
          className="flex w-fit max-w-sm items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Icon aria-hidden="true" size={18} className={`shrink-0 ${color}`} />
          <span className="line-clamp-3 min-w-0 break-words">{notice.message}</span>
        </div>
      )}
    </div>
  );
}
