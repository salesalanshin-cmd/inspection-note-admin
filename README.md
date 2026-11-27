# 검사노트 관리자 콘솔

기존 검사노트(defect-inspector) 앱의 Supabase 데이터를 읽어와 관리자용으로
통계/현황을 보여주는 Next.js 대시보드입니다.

> **DB 스키마 변경 규칙**
>
> - 이 레포(`inspection-note-admin`)의 `supabase/legacy-migrations/`는 **과거 이력 보관용**이며, **새 마이그레이션을 추가하지 않습니다.**
> - 모든 스키마 변경은 앱 레포(**defect-inspector**)의 `supabase/migrations/`에서만 합니다.
> - Supabase SQL Editor에 수동으로 DDL을 실행하지 않습니다. 앱 레포 마이그레이션을 적용하세요.

## 공지 제목과 본문 번역

관리자는 기존 공지 화면에서 한국어로 작성·수정합니다. 작업자 관리에서 영어, 베트남어, 태국어, 크메르어, 우즈베크어, 네팔어, 카자흐어 또는 인도네시아어를 선택하면 앱의 `POST /api/notices/translations` 요청이 같은 회사에 공개된 공지의 제목과 본문을 해당 언어로 반환합니다. 이전에 작성된 공지도 첫 조회 때 번역합니다. Vercel에 설정된 `ANTHROPIC_API_KEY`로 원문의 번역을 요청하며 작업자 답글은 전송 대상에서 제외합니다.

앱 저장소에서 `supabase/migrations/20261125093000_notice_translations.sql`과 `supabase/migrations/20261127030000_worker_notice_languages.sql`을 순서대로 적용한 뒤 관리자 웹을 게시하고 앱을 업데이트합니다. 서버에는 기존 `SUPABASE_SERVICE_ROLE_KEY`, 회사 설정과 `ANTHROPIC_API_KEY`가 필요합니다. 번역 캐시는 원문 해시와 언어를 확인하며 공지 수정 후 새 원문에 맞춰 갱신됩니다. 번역 서비스가 응답하지 않을 때는 원문으로 공지를 읽고 다음 조회에서 다시 번역할 수 있습니다.

## 구성

- `defect_reports`, `good_reports`, `fives_reports` 3개 테이블을 조회해서
  - 대시보드: 전체 KPI, 최근 14일 추세, 불량 유형 breakdown
  - 작업자 현황: 작업자별 불량/양품/3정5S 건수, 최근 활동일, **미준수 판정**
  - 불량 기록 / 3정5S: 필터 가능한 갤러리
- 미준수 기준일(`lib/constants.js`)
  - `INSPECTION_CYCLE_DAYS = 7` (정기검사)
  - `FIVES_CYCLE_DAYS = 7` (3정5S)
  - 현장 상황에 맞게 이 숫자만 바꾸면 전체 판정에 반영됩니다.

## DB 마이그레이션

| 위치 | 용도 |
|------|------|
| `defect-inspector/supabase/migrations/` | **유일한 스키마 변경 경로** — 여기에만 새 SQL 추가 |
| `inspection-note-admin/supabase/legacy-migrations/` | 과거 이력 참고용, **추가 금지** |

`document_folder` 등 신규 테이블·컬럼도 defect-inspector 레포에서 마이그레이션을 작성·적용합니다.

### 디케이메탈 작업자 MES 연동

작업자 관리에서 등록·복원·제외·숨김 또는 개인 정보(표시명, 공정, 역할)를 변경하면 운용과 개발 MES에 각각 반영합니다. 제외·숨김 시 개인 코드를 미사용으로 전환하고 과거 검사 이력을 보존합니다.

1. 앱 저장소의 `20261125143000_mes_worker_sync_outbox.sql` 마이그레이션을 적용하고 두 MES 환경에 작업자 연동 API를 배포합니다.
2. Vercel에 서버 루트 주소 `MES_WORKER_SYNC_BASE_URL`을 설정합니다. 개발 서버가 별도 주소이면 `MES_WORKER_SYNC_DEV_BASE_URL`도 설정합니다. API 경로는 자동으로 붙습니다.
3. Vercel의 `MES_WORKER_SYNC_SECRET`과 MES 서버의 `MobileMaterials__WorkerSync__Secret`에 같은 32바이트 이상의 임의 비밀값을 설정합니다. 관리자 웹의 `SUPABASE_SERVICE_ROLE_KEY`, 회사 코드와 `CRON_SECRET`도 설정되어 있어야 합니다.

웹은 원본 명단을 저장한 직후 연동을 시도합니다. 창을 일찍 닫으면 Cron이 아직 전송하지 않은 변경을 처리합니다. 응답이 끊어지거나 한 환경만 실패한 경우 작업자 관리의 **MES 작업자 연동 대기**에서 해당 환경의 **MES 연동 재시도**를 누릅니다. 성공 응답 서명이 확인된 환경만 대기 목록에서 사라집니다.

## 실행 방법

```bash
npm install
cp .env.example .env.local
# .env.local 에 Supabase URL / anon key 입력 (Project Settings → API)
npm run dev
```

`http://localhost:3000` 접속 → `/dashboard`로 리다이렉트됩니다.

## 배포

기존 프로젝트들처럼 Vercel에 그대로 올리면 됩니다.

```bash
git init && git add -A && git commit -m "init"
gh repo create inspection-note-admin --private --source=. --push
```

Vercel에서 이 저장소 import 후 환경변수(`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`)만 넣어주면 배포됩니다.

※ 관리자 페이지 자체에 로그인 보호가 없습니다. 외부에 공개하려면 Vercel의
Password Protection(Pro 플랜) 또는 간단한 미들웨어 인증을 추가로 붙이는 걸 권장합니다.

## 다음 단계 (알림톡 연동)

지금 버전은 "미준수 대상자" 목록까지만 화면에 보여줍니다. 실제 카카오 알림톡 발송은:

1. 카카오 비즈니스 채널 개설 + 솔라피(또는 알리고) 가입, 템플릿 승인
2. Supabase Edge Function 또는 이 Next.js 프로젝트에 API Route 추가
   (`app/api/notify/route.js`) → 매일 1회 미준수 대상자 계산 → 솔라피 API 호출
3. 스케줄링은 Vercel Cron(`vercel.json`) 또는 GitHub Actions cron으로 매일 1회 트리거

이 부분은 알림톡 채널/템플릿 승인이 끝난 뒤 이어서 구현하는 게 순서상 맞습니다.
