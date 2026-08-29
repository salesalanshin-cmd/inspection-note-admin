import { readFileSync, writeFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const loginRes = await fetch('http://localhost:3000/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: env.ADMIN_PASSWORD || 'admin' }),
});
const cookie = loginRes.headers.getSetCookie?.()?.[0]?.split(';')[0] || '';

const tests = [
  ['a', '기포는 무조건 불량인가요?'],
  ['b', 'BA-11 금형 예열 몇 분이에요?'],
  ['c', '초품 검사는 몇 개 하나요?'],
  ['d', '우리 회사 연차는 며칠인가요?'],
  ['e', '월급이 언제 들어오나요?'],
];

for (const [id, question] of tests) {
  const res = await fetch('http://localhost:3000/api/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Cookie: cookie,
    },
    body: JSON.stringify({ question }),
  });
  const data = await res.json();
  writeFileSync(`scripts/verify-ask-${id}.json`, JSON.stringify(data, null, 2), 'utf8');
  console.log(`=== ${id} ===`);
  console.log('status:', data.status, 'blocked:', data.blockedLayer);
  console.log('answer:', data.answer);
  console.log('sources:', (data.sources || []).map((s) => s.label).join(' | ') || '(none)');
  console.log(
    'top hit:',
    data.hits?.[0]
      ? `${(data.hits[0].similarity * 100).toFixed(1)}% p${data.hits[0].pageFrom}`
      : 'none'
  );
  console.log('elapsed:', data.elapsedMs, 'ms\n');
}
