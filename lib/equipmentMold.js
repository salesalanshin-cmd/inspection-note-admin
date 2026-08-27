import { supabase } from './supabase';
import { getCompanyId } from './company';

/**
 * 설비 현재 금형 변경 + mold_change_log 기록.
 * 관리자 콘솔은 worker 세션이 없으므로 changed_by 는 null 허용.
 * (앱 반장 로그인 경로에서는 worker_name 을 넘긴다.)
 *
 * @param {{
 *   equipmentId: string,
 *   fromMoldId: string|null,
 *   toMoldId: string|null,
 *   changedBy?: string|null,
 *   source?: string,
 * }} opts
 */
export async function applyMoldChange({
  equipmentId,
  fromMoldId,
  toMoldId,
  changedBy = null,
  source = 'manual',
}) {
  if (!equipmentId) throw new Error('설비가 없습니다.');

  const nextMoldId = toMoldId || null;
  const prevMoldId = fromMoldId || null;
  if (prevMoldId === nextMoldId) return { skipped: true };

  const companyId = await getCompanyId();
  const now = new Date().toISOString();

  const { error: eqError } = await supabase
    .from('equipment')
    .update({
      current_mold_id: nextMoldId,
      mold_changed_at: now,
      mold_changed_by: changedBy,
    })
    .eq('id', equipmentId)
    .eq('company_id', companyId);
  if (eqError) throw new Error(eqError.message);

  const { error: logError } = await supabase.from('mold_change_log').insert({
    company_id: companyId,
    equipment_id: equipmentId,
    from_mold_id: prevMoldId,
    to_mold_id: nextMoldId,
    source,
    changed_by: changedBy,
  });
  if (logError) throw new Error(logError.message);

  return { skipped: false, mold_changed_at: now };
}

/** product_mold 표시 라벨 */
export function moldLabel(mold) {
  if (!mold) return '';
  const code = (mold.mold_code || '').trim();
  const name = (mold.product_name || '').trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || mold.id;
}

/**
 * 마지막 교체 시각 표시.
 * 24시간 이상이면 회색 "N시간 전" 보조 문구용 값도 반환.
 */
export function formatMoldChangedMeta(iso) {
  if (!iso) return { absolute: '—', hoursAgoLabel: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { absolute: '—', hoursAgoLabel: null };

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const absolute = `${y}-${m}-${day} ${hh}:${mm}`;

  const hours = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
  const hoursAgoLabel = hours >= 24 ? `${hours}시간 전` : null;
  return { absolute, hoursAgoLabel };
}
