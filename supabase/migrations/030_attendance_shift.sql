-- 근태 주간/야간 교대 판정: 정책 shift·신호 구간, 일별 조·근거·플래그
-- 적용 순서: 028_attendance → 029_attendance_lot_indexes → 030_attendance_shift

-- ---------------------------------------------------------------------------
-- attendance_policy.shift + 신호 구간(window_*) — 하드코딩 금지, DB 값 사용
-- day 기본 예: window 07:00~20:30 / night 기본 예: window 19:00~익일 09:00
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance_policy
  ADD COLUMN IF NOT EXISTS shift text NOT NULL DEFAULT 'day';

ALTER TABLE public.attendance_policy
  ADD COLUMN IF NOT EXISTS window_start_time text;

ALTER TABLE public.attendance_policy
  ADD COLUMN IF NOT EXISTS window_end_time text;

ALTER TABLE public.attendance_policy
  ADD COLUMN IF NOT EXISTS signal_merge_minutes integer NOT NULL DEFAULT 10;

ALTER TABLE public.attendance_policy
  ADD COLUMN IF NOT EXISTS clock_out_min_gap_minutes integer NOT NULL DEFAULT 60;

-- 기존 행 보강 (NULL 이면 시드와 동일 기본)
UPDATE public.attendance_policy
SET
  window_start_time = COALESCE(window_start_time, CASE WHEN shift = 'night' THEN '19:00' ELSE '07:00' END),
  window_end_time = COALESCE(window_end_time, CASE WHEN shift = 'night' THEN '09:00' ELSE '20:30' END)
WHERE window_start_time IS NULL OR window_end_time IS NULL;

ALTER TABLE public.attendance_policy
  ALTER COLUMN window_start_time SET DEFAULT '07:00';
ALTER TABLE public.attendance_policy
  ALTER COLUMN window_end_time SET DEFAULT '20:30';

ALTER TABLE public.attendance_policy
  DROP CONSTRAINT IF EXISTS attendance_policy_shift_check;
ALTER TABLE public.attendance_policy
  ADD CONSTRAINT attendance_policy_shift_check
    CHECK (shift IN ('day', 'night'));

DROP INDEX IF EXISTS idx_attendance_policy_company_target;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_policy_company_target_shift
  ON public.attendance_policy (company_id, target_type, COALESCE(target_value, ''), shift);

COMMENT ON COLUMN public.attendance_policy.shift IS 'day|night';
COMMENT ON COLUMN public.attendance_policy.window_start_time IS
  '신호 소속 구간 시작 HH:mm (주간 예: 07:00, 야간 예: 19:00)';
COMMENT ON COLUMN public.attendance_policy.window_end_time IS
  '신호 소속 구간 종료 HH:mm — 시작보다 이르거나 같으면 익일 (야간 예: 09:00)';
COMMENT ON COLUMN public.attendance_policy.signal_merge_minutes IS
  '같은 종류 연속 신호 병합 창(분). 기본 10';
COMMENT ON COLUMN public.attendance_policy.clock_out_min_gap_minutes IS
  '출근 이후 퇴근으로 인정할 최소 간격(분). 기본 60';

COMMENT ON COLUMN public.attendance_daily.signal_kinds IS
  'JSON: {rawCount,mergedCount,hadMerge,bundles[],raw[]} — 원본 유지·묶음 메타';

-- ---------------------------------------------------------------------------
-- attendance_daily: 교대·판정 근거·확인 플래그
-- ---------------------------------------------------------------------------
ALTER TABLE public.attendance_daily
  ADD COLUMN IF NOT EXISTS shift text;

ALTER TABLE public.attendance_daily
  DROP CONSTRAINT IF EXISTS attendance_daily_shift_check;
ALTER TABLE public.attendance_daily
  ADD CONSTRAINT attendance_daily_shift_check
    CHECK (shift IS NULL OR shift IN ('day', 'night'));

ALTER TABLE public.attendance_daily
  ADD COLUMN IF NOT EXISTS judgment_rationale jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.attendance_daily
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.attendance_daily.shift IS '판정 교대 day|night — 야간 기준일은 교대 시작일(19시대)';
COMMENT ON COLUMN public.attendance_daily.judgment_rationale IS
  '{shift,rule,nationality,daySignalCount,nightSignalCount,firstSignalAt,lastSignalAt,...}';
COMMENT ON COLUMN public.attendance_daily.flags IS
  '예: 확인 필요, 국적 미설정';
