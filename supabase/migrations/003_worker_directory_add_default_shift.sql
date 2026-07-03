-- 기본 근무조 수동 지정 (NULL이면 자주검사 화면에서 기록 패턴으로 자동 판정)
ALTER TABLE public.worker_directory
  ADD COLUMN IF NOT EXISTS default_shift text
  CONSTRAINT worker_directory_default_shift_check
    CHECK (default_shift IS NULL OR default_shift IN ('day', 'night'));

COMMENT ON COLUMN public.worker_directory.default_shift IS '기본 근무조: day(주간) | night(야간). NULL이면 기록 시각 패턴으로 추정';
