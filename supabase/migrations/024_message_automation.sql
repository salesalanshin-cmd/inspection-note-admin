-- 이력 기록용 (이미 DB 반영됨 — 재실행 불필요)
-- automation_settings 라이브 컬럼: key, enabled, updated_at
-- 시드: frequent_check_auto_send / fives_auto_send /
--   defect_auto_send / document_auto_send (enabled=false)
-- + notification_send_log.auto_key 추가

CREATE TABLE IF NOT EXISTS public.automation_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_settings_all" ON public.automation_settings;
CREATE POLICY "automation_settings_all" ON public.automation_settings
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.automation_settings IS
  'AI/크론 자동 알림톡 발송 on/off (기본 false)';

INSERT INTO public.automation_settings (key, enabled)
VALUES
  ('frequent_check_auto_send', false),
  ('fives_auto_send', false),
  ('defect_auto_send', false),
  ('document_auto_send', false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.notification_send_log
  ADD COLUMN IF NOT EXISTS auto_key text;

CREATE INDEX IF NOT EXISTS idx_notification_send_log_auto_key
  ON public.notification_send_log (auto_key);

COMMENT ON COLUMN public.notification_send_log.auto_key IS
  '자동발송 중복 방지 키 (예: frequent_check:YYYY-MM-DD:이름:초품,중품)';
