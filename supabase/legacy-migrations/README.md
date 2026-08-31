# Legacy migrations — 추가 금지

> **이 디렉터리에 새 파일을 넣지 마세요.**

| 할 일 | 위치 |
|--------|------|
| 스키마 변경 (테이블·컬럼·RLS 등) | **defect-inspector** 레포 → `supabase/migrations/` |
| 과거 SQL 참고 | 이 디렉터리의 기존 파일만 읽기 |

- Supabase SQL Editor에서 DDL을 직접 실행하지 않습니다.
- 관리자 콘솔(inspection-note-admin) 코드는 마이그레이션이 적용된 스키마를 **가정**하고 동작합니다.
