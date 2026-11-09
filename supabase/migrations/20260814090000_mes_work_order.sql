-- MES 2차 모듈: 작업지시 (work_order)
-- 선행 조건: 20260813120000_mes_company_equipment.sql 적용 완료 (company, equipment, product_mold)

create table if not exists work_order (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  product_mold_id uuid not null references product_mold(id),
  target_quantity int not null,                 -- 목표수량
  status text not null default 'pending'
    check (status in ('pending','in_progress','completed')),
  planned_start_at timestamptz,                  -- 시작예정일시
  started_at timestamptz,                        -- 실제 시작
  completed_at timestamptz,                      -- 실제 완료
  assigned_worker_id uuid,                       -- 담당 작업자/조 (worker directory 참조)
  created_by uuid,                                -- 지시를 등록한 관리자
  created_at timestamptz not null default now()
);

create index if not exists idx_work_order_company on work_order(company_id);
create index if not exists idx_work_order_equipment on work_order(equipment_id, status);

-- 작업지시 상태 변경 이력 (누가 언제 상태를 바꿨는지)
create table if not exists work_order_status_history (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_order(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists idx_work_order_status_history_order on work_order_status_history(work_order_id, changed_at desc);

alter table work_order enable row level security;
alter table work_order_status_history enable row level security;
