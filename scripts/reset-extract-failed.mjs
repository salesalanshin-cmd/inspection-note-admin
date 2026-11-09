/**
 * stage=extract_failed 사진을 classify + ocr_attempts=0 으로 되돌린다.
 * 사용: node scripts/reset-extract-failed.mjs
 */
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  let text;
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    console.error('.env.local을 읽지 못했습니다.');
    process.exit(1);
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}

loadEnvLocal();

const { createServiceRoleClient } = await import('../lib/supabaseAdmin.js');
const supabase = createServiceRoleClient();

const { data, error } = await supabase
  .from('ocr_results')
  .select('id, ocr_error, ocr_attempts, parsed_data')
  .eq('status', 'done')
  .filter('parsed_data->>stage', 'eq', 'extract_failed')
  .or('is_deleted.eq.false,is_deleted.is.null');

if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = data || [];
console.log(`extract_failed ${rows.length}장`);
const byError = new Map();
for (const row of rows) {
  const key = String(row.ocr_error || '(none)').slice(0, 80);
  byError.set(key, (byError.get(key) || 0) + 1);
}
for (const [msg, count] of [...byError.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}× ${msg}`);
}

let ok = 0;
let fail = 0;
for (const row of rows) {
  const parsed = row.parsed_data && typeof row.parsed_data === 'object' && !Array.isArray(row.parsed_data)
    ? { ...row.parsed_data, stage: 'classify' }
    : { stage: 'classify' };
  const { error: upErr } = await supabase
    .from('ocr_results')
    .update({
      parsed_data: parsed,
      ocr_attempts: 0,
      ocr_error: null,
    })
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'extract_failed');
  if (upErr) {
    fail += 1;
    console.error(`fail ${row.id} ${upErr.message}`);
  } else {
    ok += 1;
  }
}

console.log(`reset ok=${ok} fail=${fail}`);
