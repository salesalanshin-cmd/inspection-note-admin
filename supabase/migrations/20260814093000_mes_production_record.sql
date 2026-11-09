-- MES 3차 모듈: 실적집계 (production_record)
-- 선행 조건: 20260814090000_mes_work_order.sql 적용 완료 (work_order)

create table if not exists production_record (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_order(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  quantity int not null,                        -- 이번 입력분 생산수량
  cycle_time_sec numeric,                        -- 사이클타임(초)
  is_anomaly boolean not null default false,     -- 이상 여부 체크
  source_type text not null default 'manual'
    check (source_type in ('manual','ocr')),     -- 수기입력 vs OCR
  recorded_by uuid,                              -- 입력한 작업자
  recorded_at timestamptz not null default now(),
  note text
);

create index if not exists idx_production_record_work_order on production_record(work_order_id);
create index if not exists idx_production_record_equipment on production_record(equipment_id, recorded_at desc);

-- 이상탐지로 생성된 이상 이벤트 (이상알림 모듈의 기반이 되는 로그)
create table if not exists anomaly_event (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id),
  work_order_id uuid references work_order(id),
  production_record_id uuid references production_record(id),
  reason text not null,                          -- 예: 'cycle_time_excess', 'defect_spike'
  detail jsonb,                                  -- 기준값 대비 실제값 등 세부정보
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_anomaly_event_equipment on anomaly_event(equipment_id, status);

alter table production_record enable row level security;
alter table anomaly_event enable row level security;
