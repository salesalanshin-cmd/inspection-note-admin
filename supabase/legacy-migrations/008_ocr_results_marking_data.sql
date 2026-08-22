-- 문서스캔 오류 영역 마킹 (불량기록 marking_data와 동일 패턴)
ALTER TABLE public.ocr_results
  ADD COLUMN IF NOT EXISTS marking_data jsonb,
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer;

COMMENT ON COLUMN public.ocr_results.marking_data IS
  '문서 오류 영역 [{type,ratio,x,y,width,height,code}, ...]';
