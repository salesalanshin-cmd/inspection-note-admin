-- 이력 기록용 (이미 DB 반영됨 — 재실행 불필요)
-- 라이브 컬럼: id, worker_name, phone_number, template_type, status,
--   error_message, created_at, sent_at
-- (auto_key는 024에서 추가)

CREATE TABLE IF NOT EXISTS public.notification_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text,
  phone_number text,
  template_type text,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notification_send_log_created_at
  ON public.notification_send_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_send_log_worker
  ON public.notification_send_log (worker_name);

ALTER TABLE public.notification_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_send_log_all" ON public.notification_send_log;
CREATE POLICY "notification_send_log_all" ON public.notification_send_log
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.notification_send_log IS
  '카카오 알림톡(솔라피) 발송 성공/실패 이력';
