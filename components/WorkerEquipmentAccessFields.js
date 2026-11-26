'use client';

const processes = ['주조', '사상', '가공', '검사', '후처리'];
const field = 'mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text';

function ScopeOptions({ title, inherited, options, value, onChange }) {
  return <fieldset className="space-y-2">
    <legend className="font-medium">{title}</legend>
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={value == null} onChange={e => onChange(e.target.checked ? null : [])} />
      {inherited}
    </label>
    {value != null && <div className="flex max-h-44 flex-wrap gap-x-4 gap-y-2 overflow-auto">
      {options.map(([code, label]) => <label key={code} className="flex items-center gap-1.5">
        <input type="checkbox" checked={value.includes(code)} onChange={e => onChange(
          e.target.checked ? [...value, code] : value.filter(item => item !== code)
        )} />
        {label}
      </label>)}
    </div>}
  </fieldset>;
}

export default function WorkerEquipmentAccessFields({ value, equipment, onChange, disabled }) {
  const rows = equipment.filter(row => row.external_source === 'MES' && row.external_code);
  const locations = [...new Set(rows.map(row => row.mes_location).filter(Boolean))].sort();
  const codes = rows.map(row => [row.external_code, row.external_code + ' · ' + row.name]);
  return <details className="col-span-full rounded-xl border border-border p-3 text-sm text-text">
    <summary className="cursor-pointer font-medium">설비 접근 설정</summary>
    <fieldset disabled={disabled} className="mt-3 space-y-4">
      <label className="block">설비 역할
        <select className={field} value={value.equipment_access_role || ''} onChange={e => onChange({ equipment_access_role: e.target.value || null })}>
          <option value="">작업자 관리 역할 따르기</option>
          <option value="worker">작업자</option><option value="lead">반장</option><option value="manager">관리자 · 모든 설비</option>
        </select>
      </label>
      <ScopeOptions title="설비 소속 공정" inherited="기본 공정 따르기" options={processes.map(name => [name, name])}
        value={value.equipment_processes} onChange={equipment_processes => onChange({ equipment_processes })} />
      <label className="block">반장 근무 위치
        <select className={field} value={value.equipment_location || ''} onChange={e => onChange({ equipment_location: e.target.value || null })}>
          <option value="">담당 설비의 MES 위치 따르기</option>
          {locations.map(location => <option key={location}>{location}</option>)}
        </select>
      </label>
      <ScopeOptions title="작업자·반장 허용 설비" inherited="허용된 공정과 위치의 모든 설비" options={codes}
        value={value.equipment_codes} onChange={equipment_codes => onChange({ equipment_codes })} />
    </fieldset>
  </details>;
}
