-- MES 1차 모듈: 다중고객(company) 구조 + 설비관리 기준정보
-- 검사노트와 동일한 Supabase 프로젝트(jedtbcrkvnutgkfjnxcx)에 적용

-- 고객사(도입기업) 마스터
create table if not exists company (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- 예: 'DK메탈'
  created_at timestamptz not null default now()
);

comment on table company is '도입기업(고객사) 마스터 — MES 다중고객 구조의 기준';

-- 설비 마스터
create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  name text not null,               -- 예: '350T 다이캐스팅 #2'
  line text,                        -- 라인 구분
  max_capacity numeric,             -- 시간당 최대 생산량 등
  installed_at date,
  created_at timestamptz not null default now()
);

create index if not exists idx_equipment_company on equipment(company_id);

-- 제품/금형 마스터
create table if not exists product_mold (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  product_name text not null,       -- 예: 'Bridge Rod'
  mold_code text not null,          -- 예: 'BR-04'
  standard_cycle_time_sec numeric,  -- 표준 사이클타임
  created_at timestamptz not null default now()
);

create index if not exists idx_product_mold_company on product_mold(company_id);

-- 설비별 이상탐지 임계값
create table if not exists equipment_threshold (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  cycle_time_excess_pct numeric not null default 30,   -- 기준 대비 초과율(%)
  consecutive_defect_count int not null default 3,     -- 연속 불량 허용횟수
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_equipment_threshold_equipment on equipment_threshold(equipment_id);

-- 설비 상태 로그 (수동 입력, PLC 미연동)
create table if not exists equipment_status_log (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  status text not null check (status in ('running','stopped','maintenance')),
  note text,
  recorded_by uuid,                 -- 작업자/관리자 ID (worker directory 참조)
  recorded_at timestamptz not null default now()
);

create index if not exists idx_equipment_status_log_equipment on equipment_status_log(equipment_id, recorded_at desc);

-- RLS 활성화 (검사노트 기존 정책 스타일과 맞춰 추후 정책 추가 필요)
alter table company enable row level security;
alter table equipment enable row level security;
alter table product_mold enable row level security;
alter table equipment_threshold enable row level security;
alter table equipment_status_log enable row level security;
