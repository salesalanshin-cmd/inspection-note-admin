-- 문서스캔 테이블 및 휴지통/오류코드 컬럼

ALTER TABLE public.defect_reports
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.fives_reports
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sos_error_code text,
  ADD COLUMN IF NOT EXISTS sos_error_note text;

CREATE TABLE IF NOT EXISTS public.ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text,
  doc_type text,
  doc_title text,
  image_url text,
  file_name text,
  doc_error_code text,
  doc_error_note text,
  ai_suggested_code text,
  ai_confidence text,
  ai_reason text,
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_results_created_at ON public.ocr_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_results_is_deleted ON public.ocr_results (is_deleted);

ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ocr_results_all" ON public.ocr_results;
CREATE POLICY "ocr_results_all" ON public.ocr_results
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ocr_results IS '문서 스캔 OCR 결과';
COMMENT ON COLUMN public.fives_reports.sos_error_code IS '3정5S SOS 오류 코드 (예: SOS-001)';
