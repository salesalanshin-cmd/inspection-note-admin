export const ACTION_FEEDBACK_EVENT = 'inspection-note:action-feedback';

export function notifyAction(message, tone = 'success') {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(new CustomEvent(ACTION_FEEDBACK_EVENT, { detail: { message, tone } }));
}
