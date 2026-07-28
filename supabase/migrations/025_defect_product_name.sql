-- defect_reports 제품명 (자유 텍스트, 자동완성·필터·AI 참고용)
-- 라이브에 이미 반영됐을 수 있음 — IF NOT EXISTS로 재실행 안전

ALTER TABLE public.defect_reports
  ADD COLUMN IF NOT EXISTS product_name text;

CREATE INDEX IF NOT EXISTS idx_defect_reports_product_name
  ON public.defect_reports (product_name)
  WHERE product_name IS NOT NULL AND product_name <> '';

COMMENT ON COLUMN public.defect_reports.product_name IS
  '불량 대상 제품명 (자유 입력, 자동완성 후보로 재사용)';
