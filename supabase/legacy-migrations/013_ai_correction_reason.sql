-- AI 오판 시 관리자 코멘트 (선택)
ALTER TABLE public.ai_correction_log
  ADD COLUMN IF NOT EXISTS correction_reason text;

COMMENT ON COLUMN public.ai_correction_log.correction_reason IS
  '관리자가 AI 제안을 거절할 때 남긴 오판 사유 (선택)';
