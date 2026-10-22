-- 근태 관리: 정책 / 일별 판정 / 메일 수신자 / 발송 이력
-- RLS는 기존 ocr_results 등과 동일 수준(개방형 FOR ALL)

-- ---------------------------------------------------------------------------
-- attendance_policy: 공정(또는 기본)별 근무·OT 기준 (하드코딩 금지)
-- target_type: 'process' | 'default'
-- target_value: 공정명(주조/사상/…) 또는 default 시 null
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  target_type text NOT NULL DEFAULT 'process',
  target_value text,
  work_start_time text NOT NULL DEFAULT '08:00',
  work_end_time text NOT NULL DEFAULT '17:00',
  ot_threshold_time text NOT NULL DEFAULT '18:00',
  ot_end_time text NOT NULL DEFAULT '20:00',
  adjust_minutes integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_policy_company_target
  ON public.attendance_policy (company_id, target_type, COALESCE(target_value, ''));

CREATE INDEX IF NOT EXISTS idx_attendance_policy_company
  ON public.attendance_policy (company_id);

ALTER TABLE public.attendance_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_policy_all" ON public.attendance_policy;
CREATE POLICY "attendance_policy_all" ON public.attendance_policy
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.attendance_policy IS '근태 정책(공정/기본). work_*·ot_* 는 HH:mm 문자열';
COMMENT ON COLUMN public.attendance_policy.target_type IS 'process | default';
COMMENT ON COLUMN public.attendance_policy.adjust_minutes IS '추정 시각 보정 허용(분). 신호보다 이른 추정으로 내리지 않음';

-- ---------------------------------------------------------------------------
-- attendance_daily: 작업자×근무일 판정
-- judgment: present(출근) | unconfirmed(미확인)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  worker_name text NOT NULL,
  work_date date NOT NULL,
  first_signal_at timestamptz,
  last_signal_at timestamptz,
  signal_kinds jsonb NOT NULL DEFAULT '[]'::jsonb,
  judgment text NOT NULL DEFAULT 'unconfirmed',
  estimated_clock_in timestamptz,
  estimated_clock_out timestamptz,
  is_ot boolean NOT NULL DEFAULT false,
  confidence text NOT NULL DEFAULT 'low',
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_daily_judgment_check
    CHECK (judgment IN ('present', 'unconfirmed')),
  CONSTRAINT attendance_daily_unique UNIQUE (company_id, worker_name, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_company_date
  ON public.attendance_daily (company_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_reviewed
  ON public.attendance_daily (company_id, work_date, reviewed);

ALTER TABLE public.attendance_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_daily_all" ON public.attendance_daily;
CREATE POLICY "attendance_daily_all" ON public.attendance_daily
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.attendance_daily IS '근무일별 근태 판정. MES 인원계획은 추후 ref 확장';
COMMENT ON COLUMN public.attendance_daily.signal_kinds IS
  '[{type,at,sourceId?}, ...] type=fives|frequent|defect|lot';

-- ---------------------------------------------------------------------------
-- 메일 수신자 (하드코딩 금지)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_mail_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_mail_recipient_unique UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_attendance_mail_recipient_company
  ON public.attendance_mail_recipient (company_id, is_active);

ALTER TABLE public.attendance_mail_recipient ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_mail_recipient_all" ON public.attendance_mail_recipient;
CREATE POLICY "attendance_mail_recipient_all" ON public.attendance_mail_recipient
  FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- mail_log: 발송 이력·재시도
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mail_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL,
  period_start date,
  period_end date,
  to_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempts integer NOT NULL DEFAULT 0,
  provider_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_log_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_mail_log_company_created
  ON public.mail_log (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_log_status
  ON public.mail_log (company_id, status, created_at DESC);

ALTER TABLE public.mail_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mail_log_all" ON public.mail_log;
CREATE POLICY "mail_log_all" ON public.mail_log
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.mail_log IS '근태 등 메일 발송 이력';

-- ---------------------------------------------------------------------------
-- LOT 신호 확장 테이블 (MES 연동 전 비어 있음 — 스키마만 확보)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lot_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  worker_name text,
  event_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_deleted boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_lot_activity_events_company_created
  ON public.lot_activity_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lot_activity_events_worker
  ON public.lot_activity_events (company_id, worker_name, created_at DESC);

ALTER TABLE public.lot_activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lot_activity_events_all" ON public.lot_activity_events;
CREATE POLICY "lot_activity_events_all" ON public.lot_activity_events
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.lot_activity_events IS
  'LOT 스캔·이동·실적·착수/종료 신호. MES 연동 시 적재. 근태 합집합 소스';
