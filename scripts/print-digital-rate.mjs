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
const { formatKstISODate } = await import('../lib/kst.js');
const { getProjectKpi } = await import('../lib/inspectionStats.js');

const supabase = createServiceRoleClient();
const code = (process.env.NEXT_PUBLIC_COMPANY_CODE || process.env.COMPANY_CODE || '').trim();
const { data: company, error: companyErr } = await supabase
  .from('company')
  .select('id')
  .eq('code', code)
  .maybeSingle();
if (companyErr || !company?.id) {
  console.error(companyErr?.message || `company code not found: ${code}`);
  process.exit(1);
}

const today = formatKstISODate(new Date());
const kpi = await getProjectKpi({
  today,
  supabase,
  companyId: company.id,
});

const pct = (rate) => (rate == null ? '—' : `${(rate * 100).toFixed(1)}%`);
console.log(`기간 ${kpi.projectFrom} ~ ${kpi.projectTo}`);
console.log(`전체 ${pct(kpi.digital.rate)} (${kpi.digital.digitalDays}/${kpi.digital.operatingDays}) 기준=${kpi.digital.basis}`);
console.log('월\t기준\t가동일\t디지털\t관리율');
for (const row of kpi.digital.months || []) {
  console.log(`${row.month}\t${row.basis}\t${row.operatingDays}\t${row.digitalDays}\t${pct(row.rate)}`);
}
