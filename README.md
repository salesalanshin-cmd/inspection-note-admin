# 검사노트 관리자 콘솔

기존 검사노트(defect-inspector) 앱의 Supabase 데이터를 읽어와 관리자용으로
통계/현황을 보여주는 Next.js 대시보드입니다. **읽기 전용**이며, 검사노트 앱의 데이터는
건드리지 않습니다.

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

스키마 변경 SQL은 `supabase/migrations/`에 `001_...`, `002_...`처럼 번호 순으로 파일을 추가해 관리합니다.

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
