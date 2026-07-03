-- AI 자동판정 메타데이터 컬럼
ALTER TABLE public.defect_reports
  ADD COLUMN IF NOT EXISTS ai_suggested_code text,
  ADD COLUMN IF NOT EXISTS ai_confidence text,
  ADD COLUMN IF NOT EXISTS ai_reason text;

ALTER TABLE public.fives_reports
  ADD COLUMN IF NOT EXISTS sos_code text,
  ADD COLUMN IF NOT EXISTS ai_suggested_code text,
  ADD COLUMN IF NOT EXISTS ai_confidence text,
  ADD COLUMN IF NOT EXISTS ai_reason text;

COMMENT ON COLUMN public.defect_reports.ai_suggested_code IS 'AI가 제안한 불량 코드 (최종 선택과 비교용)';
COMMENT ON COLUMN public.fives_reports.sos_code IS '3정5S SOS 오류 코드 (예: SOS-001)';
