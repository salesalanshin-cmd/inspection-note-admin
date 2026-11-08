# 근태 기록 카드 — 디자인 전달 자료

> **이 파일을 받은 Claude에게:** 아래는 검사노트(제조 현장 품질검사 앱, Expo) + 관리자 콘솔(inspection-note-admin, Next.js + Supabase)에 넣을 **작업자별 월간 근태 기록 카드** 디자인입니다. 디자인은 확정 시안이니 레이아웃·색·문구를 그대로 유지하고, 요청받은 작업(구현·수정·변형)만 하세요.

## 한눈에 보기

| 화면 | 용도 | 크기 | 코드 위치 |
|---|---|---|---|
| **PC 화면 (관리자용 월간 카드)** | 관리자 콘솔 근태 메뉴 > 작업자 상세, A4 인쇄 가능 | max-width 960px | §A |
| **앱 화면 (작업자용 "내 근태")** | 검사노트 앱 메뉴 | 390px 폭 기준 | §B |

함께 첨부된 이미지: `근태카드_PC화면.png`, `근태카드_앱화면.png`

- 샘플 데이터: 실제 2026년 10월 데이터, 작업자 김다운(야간조 20:00–08:00)
- 데이터 출처: 검사노트 앱 촬영 신호(자주검사 · 3정5S · 불량)의 최초·최종 시각으로 출퇴근을 추정한 근태 판정 데이터 + 자주검사(초품/중품/종품) + 불량 기록
- 스타일: 검사노트 "Industrial Calm" — 밝은 배경 #F5F7F5, 브랜드 그린 #236B59, 강조 #E9A34B, Pretendard

## 화면 구성

**PC 화면**
1. 헤더 — 이름, 조 배지(브랜드 그린), 사번, 집계 기간 / 재계산 대기 기간
2. KPI 5개 — 출근 15/19일 · 미확인 4일 · OT 11회 · 추정 근무 155.2h · 자주검사 전 공정 준수 7/18일
3. 월 달력(월요일 시작) — 출근(그린 테두리) / 미확인(빗금) / 휴무(회색) / 재계산 대기(주황 점선). 칸마다 출퇴근 시각, OT 배지, 신뢰도 ●◐○, 신호 수
4. 자주검사 수행 — 초·중·종 진행 막대 + 날짜별 3단 스트립
5. 확인 필요 — 퇴근 신호 없음 / 8시간 미만 / 토요일 미확인 자동 추출 + 신뢰도·중복병합·검수 집계
6. 불량 촬영 섹션 — 데이터 있을 때만 표시(김다운은 0건이라 숨김)
7. 하단 — 추정 방식 설명, 작업자 확인·관리자 검수 서명란

**앱 화면**
1. 월 이동 헤더(터치 48px)
2. 그린 요약 카드 — 이름·조, 재계산 대기 배지, 출근/OT/근무시간
3. 이번 주 리스트 — 날짜·출퇴근·메모·OT 배지, 확인 필요 행은 진한 주황 글자
4. 자주검사 초/중/종 3칸 — 가장 낮은 단계만 주황 배경
5. 안내 문구: "종품 검사를 퇴근 전 마지막으로 찍으면 퇴근 시각도 정확해져요."

## 디자인 토큰

```
--bg #F5F7F5   --card #FFFFFF   --ink #1A1F1C   --sub #56605B
--line #E2E7E3 --soft #EEF2EF   --brand #236B59
--amber #E9A34B (배지 '배경'만, 그 위 글자는 --ink)
--amber-ink #8A5410 (주황 계열 '글자'는 반드시 이 색 — #E9A34B 글자는 대비 부족)
--amber-soft #FDF3E4   --red #B42318 (일요일)
폰트 Pretendard, 숫자 tabular-nums
```

---

## §A. PC 화면 (관리자용) — 전체 HTML

파일로 저장해 브라우저에서 열면 그대로 보입니다.

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>김다운 10월 근태 기록 카드</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
:root{--bg:#F5F7F5;--card:#FFFFFF;--ink:#1A1F1C;--sub:#56605B;--line:#E2E7E3;--soft:#EEF2EF;--brand:#236B59;--brand-soft:#E6F0EC;--amber:#E9A34B;--amber-ink:#8A5410;--amber-soft:#FDF3E4;--red:#B42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,system-ui,sans-serif}
.num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.card{background:var(--card);border-radius:14px;padding:20px 22px}
h1,h2{margin:0}h2{font-size:17px;font-weight:700}
.ot{font-size:10px;font-weight:700;color:var(--ink);background:var(--amber);padding:1px 6px;border-radius:4px}
.muted{color:var(--sub)}
@media print{body{background:#fff}.card{border:1px solid var(--line)}}
</style></head><body>
<main style="max-width:960px;margin:0 auto;padding:48px 24px;display:flex;flex-direction:column;gap:20px">
<header style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap">
 <div style="display:flex;flex-direction:column;gap:6px">
  <div style="font-size:13px;font-weight:600;letter-spacing:.06em;color:var(--brand)">근태 기록 카드 · 2026년 10월</div>
  <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
   <h1 style="font-size:40px;font-weight:800;letter-spacing:-.02em">김다운</h1>
   <span style="font-size:14px;font-weight:600;padding:4px 10px;border-radius:999px;background:var(--brand);color:#fff">야간조 20:00–08:00</span>
   <span class="muted" style="font-size:14px">사번 [사번]</span>
  </div>
 </div>
 <div class="muted" style="text-align:right;font-size:13px;line-height:1.6">
  <div>집계 기간 <span class="num" style="color:var(--ink)">10.01 – 10.24</span></div>
  <div>10.26 – 10.29 <b style="color:var(--amber-ink)">재계산 대기</b></div>
 </div>
</header>
<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
 <div class="card" style="padding:16px 18px"><div class="muted" style="font-size:13px">출근</div><div class="num" style="font-size:30px;font-weight:700;color:var(--brand)">15<span class="muted" style="font-size:15px;font-weight:500"> / 19일</span></div></div><div class="card" style="padding:16px 18px"><div class="muted" style="font-size:13px">미확인 (신호 없음)</div><div class="num" style="font-size:30px;font-weight:700;color:var(--ink)">4<span class="muted" style="font-size:15px;font-weight:500">일</span></div></div><div class="card" style="padding:16px 18px"><div class="muted" style="font-size:13px">OT</div><div class="num" style="font-size:30px;font-weight:700;color:var(--amber-ink)">11<span class="muted" style="font-size:15px;font-weight:500">회</span></div></div><div class="card" style="padding:16px 18px"><div class="muted" style="font-size:13px">추정 근무시간</div><div class="num" style="font-size:30px;font-weight:700;color:var(--ink)">155.2<span class="muted" style="font-size:15px;font-weight:500">h</span></div></div><div class="card" style="padding:16px 18px"><div class="muted" style="font-size:13px">자주검사 전 공정 준수</div><div class="num" style="font-size:30px;font-weight:700;color:var(--ink)">7<span class="muted" style="font-size:15px;font-weight:500"> / 18일</span></div></div>
</section>
<section class="card" style="display:flex;flex-direction:column;gap:14px">
 <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h2>일별 근태</h2>
  <div class="muted" style="display:flex;gap:16px;font-size:12px;flex-wrap:wrap;align-items:center">
   <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;border:1.5px solid var(--brand)"></span> 출근</span>
   <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:repeating-linear-gradient(135deg,var(--line) 0 2px,var(--soft) 2px 5px)"></span> 미확인</span>
   <span><span class="ot">OT</span> 연장</span><span>●◐○ 신뢰도 높음·보통·낮음</span></div></div>
 <div style="overflow-x:auto"><div style="min-width:640px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px"><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--sub)">월</div><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--sub)">화</div><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--sub)">수</div><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--sub)">목</div><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--sub)">금</div><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--brand)">토</div><div style="font-size:12px;font-weight:600;padding:0 4px;color:var(--red)">일</div><div></div><div></div><div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">1</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">● 신호 4</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">2</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–?</div><div class="num muted" style="font-size:11px">◐ 신호 1</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:repeating-linear-gradient(135deg,var(--line) 0 2px,var(--soft) 2px 7px);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--brand)">3</span></div><div style="font-size:12px;font-weight:600" class="muted">미확인</div><div class="muted" style="font-size:12px">신호 없음</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--red)">4</span></div><div class="muted" style="font-size:12px">휴무</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:repeating-linear-gradient(135deg,var(--line) 0 2px,var(--soft) 2px 7px);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">5</span></div><div style="font-size:12px;font-weight:600" class="muted">미확인</div><div class="muted" style="font-size:12px">신호 없음</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">6</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">◐ 신호 2</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">7</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">● 신호 3</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">8</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">● 신호 3</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:repeating-linear-gradient(135deg,var(--line) 0 2px,var(--soft) 2px 7px);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">9</span></div><div style="font-size:12px;font-weight:600" class="muted">미확인</div><div class="muted" style="font-size:12px">신호 없음</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--brand)">10</span></div><div class="muted" style="font-size:12px">휴무</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--red)">11</span></div><div class="muted" style="font-size:12px">휴무</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">12</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">● 신호 3</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">13</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">◐ 신호 2</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">14</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:52–08:00</div><div class="num muted" style="font-size:11px">● 신호 5</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">15</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:55–05:16</div><div class="num muted" style="font-size:11px">● 신호 4</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">16</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:49–04:59</div><div class="num muted" style="font-size:11px">● 신호 3</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--brand)">17</span></div><div class="muted" style="font-size:12px">휴무</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--red)">18</span></div><div class="muted" style="font-size:12px">휴무</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">19</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:51–08:00</div><div class="num muted" style="font-size:11px">● 신호 5</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">20</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">20:00–08:00</div><div class="num muted" style="font-size:11px">● 신호 4</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">21</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:53–00:01</div><div class="num muted" style="font-size:11px">◐ 신호 2</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">22</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:51–08:00</div><div class="num muted" style="font-size:11px">● 신호 5</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--card);border:1.5px solid var(--brand)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">23</span><span class="ot">OT</span></div><div style="font-size:12px;font-weight:700;color:var(--brand)">출근</div><div class="num" style="font-size:12px">19:55–08:00</div><div class="num muted" style="font-size:11px">● 신호 4</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:repeating-linear-gradient(135deg,var(--line) 0 2px,var(--soft) 2px 7px);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--brand)">24</span></div><div style="font-size:12px;font-weight:600" class="muted">미확인</div><div class="muted" style="font-size:12px">신호 없음</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--red)">25</span></div><div class="muted" style="font-size:12px">휴무</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--amber-soft);border:1px dashed var(--amber)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">26</span></div><div style="font-size:12px;font-weight:700;color:var(--amber-ink)">재계산 대기</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--amber-soft);border:1px dashed var(--amber)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">27</span></div><div style="font-size:12px;font-weight:700;color:var(--amber-ink)">재계산 대기</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--amber-soft);border:1px dashed var(--amber)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">28</span></div><div style="font-size:12px;font-weight:700;color:var(--amber-ink)">재계산 대기</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--amber-soft);border:1px dashed var(--amber)"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">29</span></div><div style="font-size:12px;font-weight:700;color:var(--amber-ink)">재계산 대기</div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line);opacity:.6"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--ink)">30</span></div></div><div style="height:92px;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;background:var(--soft);border:1px solid var(--line);opacity:.6"><div style="display:flex;justify-content:space-between;align-items:center"><span class="num" style="font-size:13px;font-weight:700;color:var(--brand)">31</span></div></div></div></div>
</section>
<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">
 <div class="card" style="display:flex;flex-direction:column;gap:14px">
  <div style="display:flex;justify-content:space-between;align-items:baseline"><h2>자주검사 수행</h2><span class="muted" style="font-size:12px">18일 기준</span></div>
  <div style="display:grid;grid-template-columns:44px 1fr 56px;gap:10px;align-items:center"><span style="font-size:13px;font-weight:600">초품</span><div style="height:10px;border-radius:999px;background:var(--line)"><div style="height:10px;border-radius:999px;background:var(--brand);width:83%"></div></div><span class="num" style="font-size:13px;text-align:right">15/18</span></div><div style="display:grid;grid-template-columns:44px 1fr 56px;gap:10px;align-items:center"><span style="font-size:13px;font-weight:600">중품</span><div style="height:10px;border-radius:999px;background:var(--line)"><div style="height:10px;border-radius:999px;background:var(--brand);width:72%"></div></div><span class="num" style="font-size:13px;text-align:right">13/18</span></div><div style="display:grid;grid-template-columns:44px 1fr 56px;gap:10px;align-items:center"><span style="font-size:13px;font-weight:600">종품</span><div style="height:10px;border-radius:999px;background:var(--line)"><div style="height:10px;border-radius:999px;background:var(--brand);width:61%"></div></div><span class="num" style="font-size:13px;text-align:right">11/18</span></div>
  <div style="display:flex;gap:4px;padding-top:6px"><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">1</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">2</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">6</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">7</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">8</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">12</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">13</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">14</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">15</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">16</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">19</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">20</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">21</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">22</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">23</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">26</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--line)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:400;color:var(--sub)">27</span></div><div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span style="width:100%;height:8px;border-radius:2px;background:var(--brand)"></span><span class="num" style="font-size:10px;font-weight:700;color:var(--ink)">28</span></div></div>
  <div class="muted" style="font-size:12px">위에서부터 초품 · 중품 · 종품. 빈 칸은 미실시, 굵은 날짜는 전 공정 준수.</div>
 </div>
 <div class="card" style="display:flex;flex-direction:column;gap:14px">
  <h2>확인 필요</h2><div style="display:flex;flex-direction:column;gap:10px"><div style="display:grid;grid-template-columns:52px 1fr;gap:10px;font-size:13px;line-height:1.5"><span class="num" style="font-weight:700;color:var(--amber-ink)">10.02</span><span>퇴근 신호 없음 — 출근 후 기록이 이어지지 않음</span></div><div style="display:grid;grid-template-columns:52px 1fr;gap:10px;font-size:13px;line-height:1.5"><span class="num" style="font-weight:700;color:var(--amber-ink)">10.03</span><span>토요일 신호 없음 — 휴무 처리 여부</span></div><div style="display:grid;grid-template-columns:52px 1fr;gap:10px;font-size:13px;line-height:1.5"><span class="num" style="font-weight:700;color:var(--amber-ink)">10.21</span><span>00:01 마지막 신호 (추정 4.1h) — 조퇴 여부 확인</span></div><div style="display:grid;grid-template-columns:52px 1fr;gap:10px;font-size:13px;line-height:1.5"><span class="num" style="font-weight:700;color:var(--amber-ink)">10.24</span><span>토요일 신호 없음 — 휴무 처리 여부</span></div></div>
  <div style="height:1px;background:var(--line)"></div>
  <div class="muted" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-size:12px">
   <div>신뢰도 높음/보통/낮음<div class="num" style="font-size:15px;color:var(--ink);font-weight:700">11 · 4 · 4</div></div>
   <div>중복 촬영 병합<div class="num" style="font-size:15px;color:var(--ink);font-weight:700">9일</div></div>
   <div>관리자 검수<div class="num" style="font-size:15px;color:var(--ink);font-weight:700">0 / 19</div></div>
  </div>
 </div>
 
</section>
<footer style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap">
 <p class="muted" style="font-size:12px;line-height:1.6;max-width:520px;margin:0">출퇴근 시각은 검사노트 앱 촬영 신호(자주검사 · 3정5S · 불량)의 최초·최종 시각으로 추정했습니다. 퇴근 신호가 정규 퇴근 이후면 정규 퇴근 시각으로 보고 OT로 표시합니다.</p>
 <div style="display:flex;gap:12px"><div style="width:130px;height:64px;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px;background:#fff" class="muted">작업자 확인</div><div style="width:130px;height:64px;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:11px;background:#fff" class="muted">관리자 검수</div></div>
</footer>
</main></body></html>
```

## §B. 앱 화면 (작업자용) — 전체 HTML

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>내 근태</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
:root{--bg:#F5F7F5;--card:#FFFFFF;--ink:#1A1F1C;--sub:#56605B;--line:#E2E7E3;--soft:#EEF2EF;--brand:#236B59;--brand-soft:#E6F0EC;--amber:#E9A34B;--amber-ink:#8A5410;--amber-soft:#FDF3E4;--red:#B42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,system-ui,sans-serif}
.num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.card{background:var(--card);border-radius:14px;padding:20px 22px}
h1,h2{margin:0}h2{font-size:17px;font-weight:700}
.ot{font-size:10px;font-weight:700;color:var(--ink);background:var(--amber);padding:1px 6px;border-radius:4px}
.muted{color:var(--sub)}
@media print{body{background:#fff}.card{border:1px solid var(--line)}}
</style></head><body>
<main style="max-width:420px;margin:0 auto;padding:20px 16px 32px;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;justify-content:space-between;align-items:center">
 <button type="button" aria-label="이전 달" style="width:48px;height:48px;border:none;background:transparent;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--ink)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
 <div style="font-size:17px;font-weight:700">2026년 10월</div>
 <button type="button" aria-label="다음 달" style="width:48px;height:48px;border:none;background:transparent;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#9AA39E"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button>
</div>
<section style="background:var(--brand);color:#fff;border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:16px">
 <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
  <div><div style="font-size:24px;font-weight:800">김다운</div><div style="font-size:14px;opacity:.85">야간조 · 20:00–08:00</div></div>
  <span style="font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;background:var(--amber);color:var(--ink)">10.26~ 재계산 대기</span>
 </div>
 <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
  <div><div style="font-size:13px;opacity:.85">출근</div><div class="num" style="font-size:28px;font-weight:700">15<span style="font-size:14px;opacity:.85">일</span></div></div>
  <div><div style="font-size:13px;opacity:.85">OT</div><div class="num" style="font-size:28px;font-weight:700">11<span style="font-size:14px;opacity:.85">회</span></div></div>
  <div><div style="font-size:13px;opacity:.85">근무</div><div class="num" style="font-size:28px;font-weight:700">155<span style="font-size:14px;opacity:.85">h</span></div></div>
 </div>
</section>
<section class="card" style="padding:16px;display:flex;flex-direction:column;gap:4px">
 <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:6px"><h2 style="font-size:16px">이번 주 · 10.19 – 10.24</h2><a href="#" style="font-size:14px;color:var(--brand);text-decoration:none;padding:12px 0">전체 보기</a></div>
 <div style="display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;min-height:52px;border-top:1px solid var(--soft)"><div style="display:flex;flex-direction:column"><span class="num" style="font-size:14px;font-weight:700">10.19</span><span class="muted" style="font-size:11px">월</span></div><div style="display:flex;flex-direction:column;gap:2px"><span class="num" style="font-size:15px;color:var(--ink)">19:51 – 08:00</span><span style="font-size:12px;color:var(--sub)">신호 5건 · 신뢰도 높음</span></div><span class="ot" style="font-size:11px">OT</span></div><div style="display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;min-height:52px;border-top:1px solid var(--soft)"><div style="display:flex;flex-direction:column"><span class="num" style="font-size:14px;font-weight:700">10.20</span><span class="muted" style="font-size:11px">화</span></div><div style="display:flex;flex-direction:column;gap:2px"><span class="num" style="font-size:15px;color:var(--ink)">20:00 – 08:00</span><span style="font-size:12px;color:var(--sub)">신호 4건 · 신뢰도 높음</span></div><span class="ot" style="font-size:11px">OT</span></div><div style="display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;min-height:52px;border-top:1px solid var(--soft)"><div style="display:flex;flex-direction:column"><span class="num" style="font-size:14px;font-weight:700">10.21</span><span class="muted" style="font-size:11px">수</span></div><div style="display:flex;flex-direction:column;gap:2px"><span class="num" style="font-size:15px;color:var(--ink)">19:53 – 00:01</span><span style="font-size:12px;color:var(--amber-ink)">마지막 신호 00:01 · 확인 필요</span></div></div><div style="display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;min-height:52px;border-top:1px solid var(--soft)"><div style="display:flex;flex-direction:column"><span class="num" style="font-size:14px;font-weight:700">10.22</span><span class="muted" style="font-size:11px">목</span></div><div style="display:flex;flex-direction:column;gap:2px"><span class="num" style="font-size:15px;color:var(--ink)">19:51 – 08:00</span><span style="font-size:12px;color:var(--sub)">신호 5건 · 신뢰도 높음</span></div><span class="ot" style="font-size:11px">OT</span></div><div style="display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;min-height:52px;border-top:1px solid var(--soft)"><div style="display:flex;flex-direction:column"><span class="num" style="font-size:14px;font-weight:700">10.23</span><span class="muted" style="font-size:11px">금</span></div><div style="display:flex;flex-direction:column;gap:2px"><span class="num" style="font-size:15px;color:var(--ink)">19:55 – 08:00</span><span style="font-size:12px;color:var(--sub)">신호 4건 · 신뢰도 높음</span></div><span class="ot" style="font-size:11px">OT</span></div><div style="display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;min-height:52px;border-top:1px solid var(--soft)"><div style="display:flex;flex-direction:column"><span class="num" style="font-size:14px;font-weight:700">10.24</span><span class="muted" style="font-size:11px">토</span></div><div style="display:flex;flex-direction:column;gap:2px"><span class="num" style="font-size:15px;color:var(--sub)">미확인</span><span style="font-size:12px;color:var(--sub)">신호 없음</span></div></div>
</section>
<section class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
 <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 style="font-size:16px">자주검사</h2><span class="muted" style="font-size:13px">전 공정 준수 <b class="num" style="color:var(--ink)">7/18</b>일</span></div>
 <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px"><div style="background:var(--soft);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--sub)">초품</span><span class="num" style="font-size:20px;font-weight:700">15<span class="muted" style="font-size:13px;font-weight:500">/18</span></span></div><div style="background:var(--soft);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--sub)">중품</span><span class="num" style="font-size:20px;font-weight:700">13<span class="muted" style="font-size:13px;font-weight:500">/18</span></span></div><div style="background:var(--amber-soft);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:2px"><span style="font-size:13px;color:var(--amber-ink)">종품</span><span class="num" style="font-size:20px;font-weight:700">11<span class="muted" style="font-size:13px;font-weight:500">/18</span></span></div></div>
 <div class="muted" style="font-size:13px;line-height:1.5">종품 검사를 퇴근 전 마지막으로 찍으면 퇴근 시각도 정확해져요.</div>
</section>
</main></body></html>
```

---

## §C. 구현 명세 (데이터 계약 · 계산 규칙 · 완료 기준)

### 0. 목표

검사노트 데이터로 **작업자별 월간 근태 기록 카드**를 만든다.

| 화면 | 위치 | 레퍼런스 |
|---|---|---|
| 관리자용 월간 카드 | `inspection-note-admin` (Next.js) — 근태 메뉴 > 작업자 상세 | `reference/attendance-card-admin.html` |
| 작업자용 "내 근태" | 검사노트 앱 (Expo / React Native) | `reference/attendance-card-mobile.html` |

레퍼런스 HTML은 **실제 2026년 10월 데이터(김다운, 야간조)**로 만든 정적 시안이다. 레이아웃·색·문구·숫자 표시 방식을 그대로 따르고, 데이터만 DB에서 받아오게 바꾼다.

---

### 1. 먼저 할 일: 현재 구조 파악 (코드 수정 전에 보고)

1. 근태 판정 데이터가 저장된 테이블/뷰와 컬럼명을 찾는다. 현재 근태 엑셀 export(`기록` 시트) 컬럼과 매핑해서 표로 보고:
   `근무일, 작업자, 조, 판정(출근/미확인), 추정출근, 추정퇴근, OT(Y/N), 신호최초, 신호최종, 신호수(원본), 신호수(병합), 신호목록, 중복병합, 판정근거, 플래그, 검수(Y/N), 신뢰도(high/medium/low)`
2. 자주검사 테이블 컬럼 매핑: `날짜, 작업자, 시프트, 초품/중품/종품 상태·시각, 종합판정(정상/미준수)`
3. 불량 기록 테이블 매핑: `작업자, 유형코드, 세부유형, 촬영시각`
4. 근태 엑셀 `요약` 시트의 "재계산 필요 근무일"이 어디서 계산되는지 찾는다.
5. 근태 판정 로직이 이미 있는 위치(서버 함수 / SQL / Cron)와 근무일 정의(08:00 시작 24시간)를 확인한다.
6. admin의 기존 근태 메뉴 라우트, 작업자 디렉토리 페이지, 공용 UI 컴포넌트·스타일 방식(Tailwind / CSS Modules 등)을 확인한다.

**새 테이블은 만들지 않는다.** 집계는 기존 데이터로 계산한다. 필요하면 SQL view 하나 또는 서버 함수 하나만 추가한다. 마이그레이션이 필요하면 기존 번호 체계를 이어서 쓴다.

---

### 2. 데이터 계약 (관리자·앱 공통)

`getAttendanceCard(workerId, month: 'YYYY-MM')` 하나로 두 화면을 다 그린다.

```ts
type Confidence = 'high' | 'medium' | 'low';

type AttendanceDay = {
  date: string;                 // '2026-10-14' (근무일 기준)
  status: 'present' | 'unknown' | 'off' | 'pending_recalc' | 'future';
  inAt: string | null;          // 'HH:mm' 추정출근
  outAt: string | null;         // 'HH:mm' 추정퇴근 (없으면 null → 화면에 '?')
  ot: boolean;
  confidence: Confidence | null;
  signalCount: number;          // 신호수(병합)
  hours: number | null;         // 추정출근~추정퇴근 (둘 다 있을 때만)
};

type AttendanceCard = {
  worker: { id: string; name: string; employeeNo: string | null; shift: '주간' | '야간'; shiftStart: string; shiftEnd: string };
  month: string;
  coveredRange: { from: string; to: string };      // 판정이 확정된 마지막 근무일까지
  pendingRecalcDates: string[];
  summary: {
    presentDays: number; recordedDays: number;     // 15 / 19
    unknownDays: number;
    otCount: number;
    totalHours: number;                            // 소수 1자리
    confidence: Record<Confidence, number>;
    mergedDays: number;                            // 중복병합 있는 날
    reviewed: number;                              // 검수 Y
  };
  days: AttendanceDay[];                           // 해당 월 1일~말일 전부
  inspection: {
    days: { date: string; first: boolean; middle: boolean; last: boolean }[];
    firstDone: number; middleDone: number; lastDone: number;
    fullCompliantDays: number;                     // 종합판정 '정상'
    total: number;
  };
  defects: { subtype: string; count: number }[];   // 상위 5개, 없으면 [] (섹션 숨김)
  issues: { date: string; message: string }[];     // 아래 규칙
};
```

### 계산 규칙

- **status**
  - 판정 '출근' → `present`, 판정 '미확인' → `unknown`
  - 근태 행이 없고 재계산 필요 근무일 → `pending_recalc`
  - 근태 행이 없고 오늘 이후 → `future`
  - 그 외 → `off` (휴무)
- **hours**: `추정퇴근 - 추정출근`. 야간조는 날짜를 넘어가므로 timestamp 차이로 계산한다. 하나라도 없으면 null, 합계에서도 제외.
- **issues (확인 필요)**: 우선 이 3가지만 넣는다. 규칙은 한 곳(상수/함수)에 모아 나중에 정책 기준 테이블로 옮기기 쉽게 둔다.
  1. present인데 `outAt`이 없으면 `퇴근 신호 없음 — 출근 후 기록이 이어지지 않음`
  2. present이고 `hours < 8`이면 `{outAt} 마지막 신호 (추정 {hours}h) — 조퇴 여부 확인`
  3. unknown이고 토요일이면 `토요일 신호 없음 — 휴무 처리 여부`
- **검증용 기대값** (김다운, 2026-10): presentDays 15 / recordedDays 19, unknown 4, OT 11, totalHours 155.2, confidence 11·4·4, mergedDays 9, 자주검사 초15·중13·종11 / 18, 정상 7, issues = 10.02, 10.03, 10.21, 10.24. **구현 후 이 값이 나오는지 반드시 확인한다.**

---

### 3. 디자인 토큰 (검사노트 Industrial Calm)

```
--bg        #F5F7F5   페이지 배경
--card      #FFFFFF
--ink       #1A1F1C   본문
--sub       #56605B   보조 텍스트 (흰 배경 대비 4.5:1 이상)
--line      #E2E7E3   구분선, 미실시 칸
--soft      #EEF2EF   휴무 칸
--brand     #236B59   출근, 진행 막대, 강조 버튼
--amber     #E9A34B   OT 배지 배경(글자는 --ink), 재계산 대기 테두리
--amber-ink #8A5410   주황 계열 '글자'는 반드시 이 색 (#E9A34B 글자는 대비 부족)
--amber-soft #FDF3E4  재계산 대기 칸 배경
--red       #B42318   일요일 날짜
폰트: Pretendard, 숫자는 font-variant-numeric: tabular-nums
```
admin에 이미 같은 토큰이 있으면 그걸 쓰고, 없으면 테마 파일에 추가한다. 색 하드코딩 금지.

---

### 4. 관리자 화면 (Next.js)

- 라우트: 기존 근태 메뉴 하위 `/attendance/[workerId]?month=YYYY-MM`. 경로 규칙이 다르면 기존 규칙을 따른다.
- 진입 경로: 근태 목록과 작업자 디렉토리에서 이름 클릭.
- 컴포넌트 분리:
  `AttendanceCardHeader`, `AttendanceKpis`, `AttendanceCalendar`(7열 그리드, 월요일 시작, 1일 앞 빈칸), `InspectionCompliance`, `AttendanceIssues`, `DefectSummary`(데이터 없으면 렌더 안 함), `SignOffFooter`
- 상단에 월 이동(이전/다음)과 작업자 전환 셀렉트를 둔다.
- 인쇄: `@media print`로 A4 1장. 버튼·내비는 숨긴다. "인쇄/PDF" 버튼은 `window.print()`.
- 레이아웃: 좁은 화면에서는 KPI가 줄바꿈되고, 달력은 가로 스크롤 박스(min-width 640px)로 넣는다.
- 권한: 기존 관리자 인증과 회사코드 범위를 그대로 적용한다. 다른 회사 작업자 조회가 안 되는지 확인한다.

### 5. 앱 화면 (Expo / React Native)

- 메뉴에 "내 근태" 추가. 로그인된 작업자 본인 데이터만 조회한다.
- 구성(레퍼런스 mobile.html 순서):
  1. 월 이동 헤더 (터치 영역 48px 이상)
  2. 브랜드 그린 요약 카드: 이름, 조·시간, 재계산 대기 배지, 출근/OT/근무시간
  3. 이번 주 리스트: 행 높이 52px 이상, 확인 필요 행은 메모를 amber-ink로 표시
  4. 자주검사 초/중/종 3칸: 가장 낮은 단계만 amber-soft로 강조
  5. 안내 문구: "종품 검사를 퇴근 전 마지막으로 찍으면 퇴근 시각도 정확해져요."
- "전체 보기"를 누르면 월 달력 화면으로 이동한다(관리자 달력과 같은 규칙, 칸은 작게).
- 다국어: 문구는 기존 i18n 구조가 있으면 키로 등록한다(야간조 외국인 작업자 대상).
- API는 admin과 같은 계약(§2)을 쓴다. Supabase RPC 또는 admin API route 중 기존 방식을 따른다.

---

### 6. 하지 말 것

- 새 테이블을 만들거나 기존 근태 판정 로직을 바꾸지 말 것. 이번 작업은 **조회·표시만**이다.
- 레퍼런스에 없는 지표(지각, 결근 사유 등)를 임의로 추가하지 말 것.
- 사번이 없으면 `사번 —`으로 표시한다. 임의 값을 넣지 말 것.
- production Supabase로 테스트하지 말 것. 데모/개발 환경에서 확인한다.

### 7. 완료 기준

- [ ] §2 검증 기대값이 김다운 2026-10에서 일치
- [ ] 주간조 작업자 1명, 데이터가 거의 없는 작업자 1명에서도 화면이 깨지지 않음
- [ ] admin 인쇄 미리보기가 A4 1장
- [ ] 앱 화면이 소형 안드로이드(360px 폭)에서 잘림 없이 표시
- [ ] 다른 회사코드 작업자 조회 불가
