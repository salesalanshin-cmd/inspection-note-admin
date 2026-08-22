-- worker_directory: 관리자 콘솔(anon key)에서 조회·등록·수정 허용
ALTER TABLE public.worker_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_directory_select_anon" ON public.worker_directory;
CREATE POLICY "worker_directory_select_anon"
  ON public.worker_directory
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "worker_directory_insert_anon" ON public.worker_directory;
CREATE POLICY "worker_directory_insert_anon"
  ON public.worker_directory
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "worker_directory_update_anon" ON public.worker_directory;
CREATE POLICY "worker_directory_update_anon"
  ON public.worker_directory
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
