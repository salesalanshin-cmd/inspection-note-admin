-- 작업자 디렉터리: 관리자 제외 플래그, 메모, (선택) 기본 근무조
CREATE TABLE IF NOT EXISTS public.worker_directory (
  worker_name text PRIMARY KEY,
  excluded boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.worker_directory IS '검사노트 관리자 콘솔용 작업자 마스터 (제외·메모)';
COMMENT ON COLUMN public.worker_directory.worker_name IS '작업자 이름 (defect/good/fives_reports.worker_name과 동일)';
COMMENT ON COLUMN public.worker_directory.excluded IS 'true면 실적·통계 화면에서 제외 (관리자·퇴사자 등)';
COMMENT ON COLUMN public.worker_directory.note IS '관리용 메모 (예: 관리자, 퇴사, 야간조)';
