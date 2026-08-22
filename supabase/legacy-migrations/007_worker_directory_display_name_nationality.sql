-- 작업자 표시 이름(별칭) · 국적
ALTER TABLE public.worker_directory
ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.worker_directory
ADD COLUMN IF NOT EXISTS nationality text;

COMMENT ON COLUMN public.worker_directory.display_name IS
  '화면·엑셀 표시용 별칭. 비어 있으면 worker_name 사용. DB 키/필터는 worker_name 유지.';
COMMENT ON COLUMN public.worker_directory.nationality IS
  '국적 (예: 한국, 베트남). 관리 표시용.';
