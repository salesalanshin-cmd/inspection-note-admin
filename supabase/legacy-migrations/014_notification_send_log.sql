-- 카카오 알림톡 발송 결과 로그
CREATE TABLE IF NOT EXISTS public.notification_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text,
  phone_number text,
  template_type text,
  template_id text,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  message_id text,
  error_message text,
  variables jsonb,
  created_at timestamptz DEFAULT now()
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
