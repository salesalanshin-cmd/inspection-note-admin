/**
 * working_report 공정·이름 매칭 재적용 + 10월 전후 비교.
 * 사용: node --import ./tests/esm-ext-register.mjs scripts/reapply-worklog-process.mjs
 */
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
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
const { getInspectionReportRange, summarizeInspectionPeriod } = await import('../lib/inspectionStats.js');
const { reapplyWorklogProcessInference } = await import('../lib/worklogProcessReapply.js');

const supabase = createServiceRoleClient();
const code = (process.env.NEXT_PUBLIC_COMPANY_CODE || process.env.COMPANY_CODE || '').trim();
const { data: company, error: companyErr } = await supabase
  .from('company')
  .select('id')
  .eq('code', code)
  .maybeSingle();
if (companyErr || !company?.id) {
  console.error(companyErr?.message || `company not found: ${code}`);
  process.exit(1);
}

async function octoberSummary() {
  const range = await getInspectionReportRange({
    supabase,
    companyId: company.id,
    from: '2026-10-01',
    to: '2026-10-31',
  });
  const summary = summarizeInspectionPeriod(range.days);
  return {
    inspectedQty: summary.inspectedQty,
    defectQty: summary.defectQty,
    defectRate: summary.defectRate,
    dayCount: summary.dayCount,
    personDays: summary.personDays,
    perPersonDaily: summary.perPersonDaily,
  };
}

const pct = (rate) => (rate == null ? '—' : `${(rate * 100).toFixed(2)}%`);
const before = await octoberSummary();
console.log('BEFORE October', before, pct(before.defectRate));

const result = await reapplyWorklogProcessInference(company.id, { supabaseAdmin: supabase });
console.log('REAPPLY', JSON.stringify(result, null, 2));

const after = await octoberSummary();
console.log('AFTER October', after, pct(after.defectRate));
console.log('DELTA', {
  inspectedQty: after.inspectedQty - before.inspectedQty,
  defectQty: after.defectQty - before.defectQty,
  defectRateBefore: pct(before.defectRate),
  defectRateAfter: pct(after.defectRate),
  personDays: after.personDays - before.personDays,
  perPersonDailyBefore: before.perPersonDaily,
  perPersonDailyAfter: after.perPersonDaily,
});
