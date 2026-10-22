-- 근태 LOT 신호 조회용 인덱스
-- lot_moves / production_events 는 앱(공유 Supabase) 마이그레이션으로 생성됨.
-- 테이블이 있을 때만 인덱스 추가 (idempotent).

DO $$
BEGIN
  IF to_regclass('public.lot_moves') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_lot_moves_company_occurred
      ON public.lot_moves (company_id, occurred_at DESC);
  END IF;

  IF to_regclass('public.production_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_production_events_occurred
      ON public.production_events (occurred_at DESC);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'production_events'
        AND column_name = 'company_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_production_events_company_occurred
        ON public.production_events (company_id, occurred_at DESC);
    END IF;
  END IF;

  IF to_regclass('public.lot_activity_events') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON TABLE public.lot_activity_events IS
        'LOT 보조 적재. 근태 신호 본체는 lot_moves(lot_move)·production_events(production) 직접 조회'
    $c$;
  END IF;
END $$;
