-- 문서 영역 지적사항 알림 대기열
-- (카카오 알림톡 실제 발송은 솔라피 등 연동 준비 후 별도 구현. 지금은 pending 적재만)

CREATE TABLE IF NOT EXISTS public.document_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_result_id uuid NOT NULL REFERENCES public.ocr_results (id) ON DELETE CASCADE,
  worker_name text,
  marker_index integer NOT NULL,
  doc_error_code text,
  doc_error_note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  notified_at timestamptz,
  CONSTRAINT document_notification_queue_ocr_marker_unique UNIQUE (ocr_result_id, marker_index)
);

CREATE INDEX IF NOT EXISTS idx_document_notification_queue_status
  ON public.document_notification_queue (status);

CREATE INDEX IF NOT EXISTS idx_document_notification_queue_ocr
  ON public.document_notification_queue (ocr_result_id);

ALTER TABLE public.document_notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_notification_queue_all" ON public.document_notification_queue;
CREATE POLICY "document_notification_queue_all" ON public.document_notification_queue
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.document_notification_queue IS
  '문서 영역 지적사항 알림 대기열 — 발송 UI/알림톡 연동 전 pending 적재용';
