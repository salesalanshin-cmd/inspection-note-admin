-- 불량관리 담당 업무 플래그 (불량 기록 페이지 표시 여부)
ALTER TABLE public.worker_directory
ADD COLUMN IF NOT EXISTS handles_defects boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.worker_directory.handles_defects IS
  'true면 불량 기록 페이지에 표시. 제외(excluded) 작업자도 켤 수 있음.';
