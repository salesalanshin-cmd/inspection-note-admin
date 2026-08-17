-- 작업자 담당 공정 (주조/사상/가공/검사/기타). null = 미지정
ALTER TABLE public.worker_directory
ADD COLUMN IF NOT EXISTS process text;

COMMENT ON COLUMN public.worker_directory.process IS
  '담당 공정 (주조, 사상, 가공, 검사, 기타). null이면 미지정. 현황 화면 공정 필터에 사용.';
