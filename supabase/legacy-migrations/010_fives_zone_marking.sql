-- 3정5S 구역 코드 + 영역 마킹
ALTER TABLE public.fives_reports
  ADD COLUMN IF NOT EXISTS zone_code text,
  ADD COLUMN IF NOT EXISTS marking_data jsonb;

COMMENT ON COLUMN public.fives_reports.zone_code IS '구역 코드 (ZONE_CODES: Z01~Z18)';
COMMENT ON COLUMN public.fives_reports.marking_data IS
  '지적 영역 [{type,ratio,x,y,width,height,code}, ...]';
