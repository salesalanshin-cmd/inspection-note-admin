-- OCR 분류 파이프라인 (1단계: 문서 유형 분류)
-- idempotent: ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS

-- doc_type 값 규약 (앱 상수, CHECK 제약 없음):
--   inspection = 자주검사
--   5s         = 3정5S
--   defect     = 불량
--   worklog    = 작업일보
--   other      = 기타

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

COMMENT ON COLUMN public.ocr_results.status IS
  'OCR 파이프라인 상태: pending | processing | done | failed | skipped';

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS parsed_data jsonb;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS ocr_model text;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS ocr_confidence text;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS ocr_error text;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS ocr_attempts integer DEFAULT 0;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS ocr_processed_at timestamptz;

ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- 기존 행: status 비어 있으면 pending 유지/설정
UPDATE public.ocr_results
SET status = 'pending'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_results_status_created_at
  ON public.ocr_results (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ocr_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_result_id uuid REFERENCES public.ocr_results (id) ON DELETE SET NULL,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_usage_created_at
  ON public.ocr_usage (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocr_usage_ocr_result_id
  ON public.ocr_usage (ocr_result_id);

ALTER TABLE public.ocr_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ocr_usage_all" ON public.ocr_usage;
CREATE POLICY "ocr_usage_all" ON public.ocr_usage
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ocr_usage IS 'OCR/분류 Claude 호출 토큰 사용량';
