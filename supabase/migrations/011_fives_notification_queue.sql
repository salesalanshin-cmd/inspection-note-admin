-- 3정5S 영역 지적사항 알림 대기열
-- (카카오 알림톡 실제 발송은 솔라피 등 연동 준비 후 별도 구현. 지금은 pending 적재만)

CREATE TABLE IF NOT EXISTS public.fives_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fives_report_id uuid NOT NULL REFERENCES public.fives_reports (id) ON DELETE CASCADE,
  worker_name text,
  marker_index integer NOT NULL,
  sos_error_code text,
  sos_error_note text,
  zone_code text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  notified_at timestamptz,
  CONSTRAINT fives_notification_queue_report_marker_unique UNIQUE (fives_report_id, marker_index)
);

CREATE INDEX IF NOT EXISTS idx_fives_notification_queue_status
  ON public.fives_notification_queue (status);

CREATE INDEX IF NOT EXISTS idx_fives_notification_queue_report
  ON public.fives_notification_queue (fives_report_id);

ALTER TABLE public.fives_notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fives_notification_queue_all" ON public.fives_notification_queue;
CREATE POLICY "fives_notification_queue_all" ON public.fives_notification_queue
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.fives_notification_queue IS
  '3정5S 영역 지적사항 알림 대기열 — 발송 UI/알림톡 연동 전 pending 적재용';
