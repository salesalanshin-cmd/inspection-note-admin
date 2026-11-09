-- MES 4차 모듈: 이상알림 (인앱 알림함)
-- 선행 조건: 20260814093000_mes_production_record.sql 적용 완료 (anomaly_event)
-- 설계 원칙: 알림 채널(카톡/이메일/SMS 등)은 여기 안에 하드코딩하지 않고,
-- anomaly_event를 구독하는 별도 "채널 플러그인"이 나중에 붙는 구조로 남겨둔다.
-- 지금은 in-app 알림함(알림 조회 + 조치 입력)만 구현한다.

create table if not exists anomaly_notification (
  id uuid primary key default gen_random_uuid(),
  anomaly_event_id uuid not null references anomaly_event(id) on delete cascade,
  channel text not null default 'in_app'
    check (channel in ('in_app','kakao','email','sms')),  -- 지금은 in_app만 사용
  recipient_id uuid,                              -- 알림 받을 관리자 (worker directory 참조)
  delivered_at timestamptz,                       -- 실제 발송된 시각 (in_app이면 생성과 동시)
  read_at timestamptz,                             -- 관리자가 확인한 시각
  created_at timestamptz not null default now()
);

create index if not exists idx_anomaly_notification_event on anomaly_notification(anomaly_event_id);
create index if not exists idx_anomaly_notification_recipient on anomaly_notification(recipient_id, read_at);

-- 이상 이벤트에 대한 조치 입력 (누가, 어떻게 조치했는지)
create table if not exists anomaly_action (
  id uuid primary key default gen_random_uuid(),
  anomaly_event_id uuid not null references anomaly_event(id) on delete cascade,
  action_type text,                                -- 예: '금형조정','청소','자재교체','기타'
  action_note text,
  acted_by uuid,                                   -- 조치한 관리자/작업자
  acted_at timestamptz not null default now()
);

create index if not exists idx_anomaly_action_event on anomaly_action(anomaly_event_id);

alter table anomaly_notification enable row level security;
alter table anomaly_action enable row level security;
