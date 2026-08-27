'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  clearCompanyIdCache,
  getCompanyCode,
  getCompanyId,
  isValidCompanyCode,
} from '../../lib/company';
import {
  applyMoldChange,
  formatMoldChangedMeta,
  moldLabel,
} from '../../lib/equipmentMold';
import PageHeader from '../../components/PageHeader';
import CsvImportPanel, { inputClass } from '../../components/CsvImportPanel';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import ConfirmDialog from '../../components/ConfirmDialog';

const TABS = [
  { id: 'company', label: '회사' },
  { id: 'equipment', label: '설비' },
  { id: 'product_mold', label: '제품·금형' },
];

const EQUIPMENT_CSV_HEADERS = ['name', 'line', 'max_capacity', 'installed_at'];
const PRODUCT_MOLD_CSV_HEADERS = ['product_name', 'mold_code', 'standard_cycle_time_sec'];

const btnPrimary =
  'min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'min-h-[44px] rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

function draftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function validateEquipmentRow(row) {
  const name = (row.name ?? '').trim();
  if (!name) return { valid: false, errors: ['name 필수'] };
  const cap = (row.max_capacity ?? '').trim();
  if (cap && Number.isNaN(Number(cap))) {
    return { valid: false, errors: ['max_capacity 숫자'] };
  }
  return { valid: true };
}

function validateProductMoldRow(row) {
  const productName = (row.product_name ?? '').trim();
  const moldCode = (row.mold_code ?? '').trim();
  const errors = [];
  if (!productName) errors.push('product_name 필수');
  if (!moldCode) errors.push('mold_code 필수');
  const cycle = (row.standard_cycle_time_sec ?? '').trim();
  if (cycle && Number.isNaN(Number(cycle))) errors.push('standard_cycle_time_sec 숫자');
  if (errors.length) return { valid: false, errors };
  return { valid: true };
}

function equipmentPayload(row, companyId) {
  const cap = (row.max_capacity ?? '').trim();
  const installed = (row.installed_at ?? '').trim();
  return {
    company_id: companyId,
    name: row.name.trim(),
    line: (row.line ?? '').trim() || null,
    max_capacity: cap ? Number(cap) : null,
    installed_at: installed || null,
  };
}

function productMoldPayload(row, companyId) {
  const cycle = (row.standard_cycle_time_sec ?? '').trim();
  return {
    company_id: companyId,
    product_name: row.product_name.trim(),
    mold_code: row.mold_code.trim(),
    standard_cycle_time_sec: cycle ? Number(cycle) : null,
  };
}

function MasterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillProductName = searchParams.get('product_name')?.trim() ?? '';
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) return tabParam;
    return 'company';
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [company, setCompany] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [productMolds, setProductMolds] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', code: '' });
  const prefillApplied = useRef(false);

  const companyId = company?.id ?? null;

  const fetchAll = useCallback(async () => {
    setError(null);
    const code = getCompanyCode();
    const [companyRes, companyIdValue] = await Promise.all([
      code
        ? supabase.from('company').select('*').eq('code', code).maybeSingle()
        : supabase.from('company').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      getCompanyId().catch(() => null),
    ]);

    if (companyRes.error) throw new Error(companyRes.error.message);

    const co = companyRes.data ?? null;
    const cid = co?.id || companyIdValue;
    if (!cid) {
      setCompany(null);
      setCompanyName('');
      setEquipment([]);
      setProductMolds([]);
      return;
    }

    const [equipmentRes, moldRes] = await Promise.all([
      supabase.from('equipment').select('*').eq('company_id', cid).order('name'),
      supabase.from('product_mold').select('*').eq('company_id', cid).order('product_name'),
    ]);

    if (equipmentRes.error) throw new Error(equipmentRes.error.message);
    if (moldRes.error) throw new Error(moldRes.error.message);

    setCompany(co);
    setCompanyName(co?.name ?? '');
    setShowApiKey(false);
    setEquipment(equipmentRes.data ?? []);
    setProductMolds(moldRes.data ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await fetchAll();
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (!prefillProductName || prefillApplied.current || loading) return;
    prefillApplied.current = true;
    setActiveTab('product_mold');
    setProductMolds((prev) => {
      if (prev.some((r) => r._draft && r.product_name === prefillProductName)) return prev;
      return [
        ...prev,
        {
          id: draftId(),
          _draft: true,
          product_name: prefillProductName,
          mold_code: '',
          standard_cycle_time_sec: '',
        },
      ];
    });
  }, [prefillProductName, loading]);

  async function handleSaveCompany() {
    const name = companyName.trim();
    if (!name) {
      setFormError('회사 이름을 입력하세요.');
      return;
    }
    if (!company?.id) {
      setFormError('새 회사는 아래 「새 회사 추가」폼을 사용하세요.');
      return;
    }
    setSaving('company');
    setFormError(null);
    const { error: updateError } = await supabase
      .from('company')
      .update({ name })
      .eq('id', company.id);
    setSaving(null);
    if (updateError) {
      setFormError(updateError.message);
      return;
    }
    await fetchAll();
  }

  async function handleToggleActive() {
    if (!company?.id) return;
    setSaving('company-active');
    setFormError(null);
    const { error: updateError } = await supabase
      .from('company')
      .update({ is_active: !company.is_active })
      .eq('id', company.id);
    setSaving(null);
    if (updateError) {
      setFormError(updateError.message);
      return;
    }
    await fetchAll();
  }

  async function handleRegenerateApiKey() {
    if (!company?.id) return;
    setSaving('company-key');
    setFormError(null);
    const nextKey = crypto.randomUUID();
    const { error: updateError } = await supabase
      .from('company')
      .update({ api_key: nextKey })
      .eq('id', company.id);
    setSaving(null);
    setRegenConfirm(false);
    if (updateError) {
      setFormError(updateError.message);
      return;
    }
    setShowApiKey(true);
    await fetchAll();
  }

  async function handleCreateCompany() {
    const name = newCompany.name.trim();
    const code = newCompany.code.trim().toLowerCase();
    if (!name) {
      setFormError('새 회사 이름을 입력하세요.');
      return;
    }
    if (!isValidCompanyCode(code)) {
      setFormError('code는 소문자 영문과 하이픈만 사용할 수 있습니다. (예: dkmetal, acme-co)');
      return;
    }
    setSaving('company-create');
    setFormError(null);
    const { data, error: insertError } = await supabase
      .from('company')
      .insert({
        name,
        code,
        api_key: crypto.randomUUID(),
        is_active: true,
      })
      .select()
      .single();
    setSaving(null);
    if (insertError) {
      setFormError(insertError.message);
      return;
    }
    setNewCompany({ name: '', code: '' });
    clearCompanyIdCache();
    setFormError(
      `회사 '${data.code}' 가 생성되었습니다. .env의 COMPANY_CODE / NEXT_PUBLIC_COMPANY_CODE 를 '${data.code}' 로 바꾼 뒤 서버를 재시작하세요.`
    );
  }

  async function saveEquipmentRow(row) {
    if (!companyId) {
      setFormError('먼저 회사를 등록하세요.');
      return false;
    }
    const name = (row.name ?? '').trim();
    if (!name) return false;

    setSaving(`eq-${row.id}`);
    setFormError(null);
    const payload = equipmentPayload(row, companyId);

    let dbError;
    if (row.id && !String(row.id).startsWith('draft-')) {
      ({ error: dbError } = await supabase
        .from('equipment')
        .update(payload)
        .eq('id', row.id)
        .eq('company_id', companyId));
    } else {
      const { data, error: insertError } = await supabase
        .from('equipment')
        .insert(payload)
        .select()
        .single();
      dbError = insertError;
      if (!insertError && data) {
        setEquipment((prev) => prev.map((r) => (r.id === row.id ? data : r)));
      }
    }
    setSaving(null);
    if (dbError) {
      setFormError(dbError.message);
      return false;
    }
    await fetchAll();
    return true;
  }

  async function deleteEquipment(id) {
    if (!id || String(id).startsWith('draft-')) {
      setEquipment((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    setSaving(`eq-del-${id}`);
    const { error: delError } = await supabase
      .from('equipment')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    setSaving(null);
    if (delError) {
      setFormError(delError.message);
      return;
    }
    await fetchAll();
  }

  /**
   * 현재 금형 변경 — equipment 갱신 + mold_change_log(source=manual).
   * 관리자 콘솔은 worker 세션이 없어 mold_changed_by / changed_by 는 null.
   */
  async function changeCurrentMold(row, toMoldId) {
    if (!row?.id || String(row.id).startsWith('draft-')) return;
    const next = toMoldId || null;
    const prev = row.current_mold_id || null;
    if (prev === next) return;

    setSaving(`eq-mold-${row.id}`);
    setFormError(null);
    try {
      const result = await applyMoldChange({
        equipmentId: row.id,
        fromMoldId: prev,
        toMoldId: next,
        changedBy: null,
        source: 'manual',
      });
      if (!result.skipped) {
        setEquipment((prevList) =>
          prevList.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  current_mold_id: next,
                  mold_changed_at: result.mold_changed_at,
                  mold_changed_by: null,
                }
              : r
          )
        );
      }
    } catch (err) {
      setFormError(err?.message || '금형 변경에 실패했습니다.');
    } finally {
      setSaving(null);
    }
  }

  async function saveProductMoldRow(row) {
    if (!companyId) {
      setFormError('먼저 회사를 등록하세요.');
      return false;
    }
    const validation = validateProductMoldRow(row);
    if (!validation.valid) return false;

    setSaving(`pm-${row.id}`);
    setFormError(null);
    const payload = productMoldPayload(row, companyId);

    let dbError;
    if (row.id && !String(row.id).startsWith('draft-')) {
      ({ error: dbError } = await supabase
        .from('product_mold')
        .update(payload)
        .eq('id', row.id)
        .eq('company_id', companyId));
    } else {
      const { data, error: insertError } = await supabase
        .from('product_mold')
        .insert(payload)
        .select()
        .single();
      dbError = insertError;
      if (!insertError && data) {
        setProductMolds((prev) => prev.map((r) => (r.id === row.id ? data : r)));
      }
    }
    setSaving(null);
    if (dbError) {
      setFormError(dbError.message);
      return false;
    }
    await fetchAll();
    return true;
  }

  async function deleteProductMold(id) {
    if (!id || String(id).startsWith('draft-')) {
      setProductMolds((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    setSaving(`pm-del-${id}`);
    const { error: delError } = await supabase
      .from('product_mold')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    setSaving(null);
    if (delError) {
      setFormError(delError.message);
      return;
    }
    await fetchAll();
  }

  function updateEquipmentLocal(id, patch) {
    setEquipment((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateProductMoldLocal(id, patch) {
    setProductMolds((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addEquipmentDraft() {
    setEquipment((prev) => [
      ...prev,
      { id: draftId(), _draft: true, name: '', line: '', max_capacity: '', installed_at: '' },
    ]);
  }

  function addProductMoldDraft(productName = '') {
    setProductMolds((prev) => [
      ...prev,
      {
        id: draftId(),
        _draft: true,
        product_name: productName,
        mold_code: '',
        standard_cycle_time_sec: '',
      },
    ]);
  }

  async function importEquipmentCsv(rows) {
    if (!companyId) return { ok: false, message: '회사를 먼저 등록하세요.' };
    const payloads = rows.map((row) => equipmentPayload(row, companyId));
    const { error: insertError } = await supabase.from('equipment').insert(payloads);
    if (insertError) return { ok: false, message: insertError.message };
    await fetchAll();
    return { ok: true };
  }

  async function importProductMoldCsv(rows) {
    if (!companyId) return { ok: false, message: '회사를 먼저 등록하세요.' };
    const payloads = rows.map((row) => productMoldPayload(row, companyId));
    const { error: insertError } = await supabase.from('product_mold').insert(payloads);
    if (insertError) return { ok: false, message: insertError.message };
    await fetchAll();
    return { ok: true };
  }

  const needsCompany = !companyId && activeTab !== 'company';

  if (loading) return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-sm text-danger">오류: {error}</div>;

  return (
    <div>
      <PageHeader
        eyebrow="MASTER"
        title="MES 기준정보"
        description="모바일 앱 교대 세팅(설비·금형 선택)에 쓰이는 기준 데이터입니다. 회사 → 설비·제품 순으로 등록하세요."
      />

      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface2 p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  router.replace(`/master?tab=${tab.id}`, { scroll: false });
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-surface text-text shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Link
            href="/master/mapping"
            className="min-h-[44px] rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-surface2 md:min-h-0"
          >
            제품 매칭 확인 →
          </Link>
          <Link
            href="/master/mold-history"
            className="min-h-[44px] rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-surface2 md:min-h-0"
          >
            금형 교체 이력 →
          </Link>
        </div>

        {formError ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{formError}</div>
        ) : null}

        {needsCompany ? (
          <div className="rounded-xl border border-warn/30 bg-warnSoft px-4 py-3 text-sm text-warn">
            설비·제품·금형을 등록하려면 먼저 회사 탭에서 회사를 1건 등록하세요.
          </div>
        ) : null}

        {activeTab === 'company' ? (
          <section className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-text">현재 회사</h2>
              <p className="text-xs text-muted">
                env <code className="rounded bg-surface2 px-1">COMPANY_CODE</code>=
                {getCompanyCode() || '(미설정)'} 기준으로 로드합니다. api_key는
                어드민 env에 넣지 마세요.
              </p>
              {company ? (
                <div className="max-w-lg space-y-4 rounded-xl border border-border bg-surface p-4 shadow-card">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted">회사 이름</span>
                    <input
                      type="text"
                      value={companyName}
                      disabled={saving === 'company'}
                      className={`${inputClass} w-full`}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted">code</div>
                      <div className="mt-0.5 font-mono text-text">{company.code || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">활성</div>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(company.is_active)}
                          disabled={saving === 'company-active'}
                          onClick={handleToggleActive}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                            company.is_active ? 'bg-accent' : 'bg-border'
                          }`}
                        >
                          <span
                            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              company.is_active ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-xs text-muted">
                          {company.is_active ? '활성' : '비활성'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted">api_key</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-xl border border-border bg-surface2 px-3 py-2 font-mono text-xs text-text">
                        {showApiKey
                          ? company.api_key || '(없음)'
                          : '●●●●●●●●●●●●●●●●'}
                      </code>
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        className={btnSecondary}
                      >
                        {showApiKey ? '숨기기' : '보기'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegenConfirm(true)}
                        disabled={saving === 'company-key'}
                        className={btnSecondary}
                      >
                        키 재발급
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveCompany}
                    disabled={!companyName.trim() || saving === 'company'}
                    className={btnPrimary}
                  >
                    이름 저장
                  </button>
                  <p className="text-xs text-muted">
                    ID <span className="font-mono">{company.id}</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  COMPANY_CODE에 해당하는 회사가 없습니다. 아래에서 추가하세요.
                </p>
              )}
            </div>

            <div className="space-y-4 border-t border-border pt-6">
              <h2 className="text-base font-semibold text-text">새 회사 추가</h2>
              <div className="max-w-lg space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted">이름</span>
                  <input
                    type="text"
                    value={newCompany.name}
                    disabled={saving === 'company-create'}
                    placeholder="(주)디케이메탈"
                    className={`${inputClass} w-full`}
                    onChange={(e) =>
                      setNewCompany((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted">
                    code (소문자 영문·하이픈)
                  </span>
                  <input
                    type="text"
                    value={newCompany.code}
                    disabled={saving === 'company-create'}
                    placeholder="dkmetal"
                    className={`${inputClass} w-full font-mono`}
                    onChange={(e) =>
                      setNewCompany((s) => ({
                        ...s,
                        code: e.target.value.toLowerCase(),
                      }))
                    }
                  />
                </label>
                <p className="text-[11px] text-muted">
                  api_key는 저장 시 자동 생성됩니다 (UUID).
                </p>
                <button
                  type="button"
                  onClick={handleCreateCompany}
                  disabled={
                    saving === 'company-create' ||
                    !newCompany.name.trim() ||
                    !newCompany.code.trim()
                  }
                  className={btnPrimary}
                >
                  회사 등록
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'equipment' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-text">설비</h2>
              <button
                type="button"
                disabled={!companyId}
                onClick={addEquipmentDraft}
                className={`inline-flex items-center gap-2 ${btnSecondary}`}
              >
                <Plus className="h-4 w-4" />
                행 추가
              </button>
            </div>

            <CsvImportPanel
              title="CSV 일괄 등록"
              expectedHeaders={EQUIPMENT_CSV_HEADERS}
              headerHelp="첫 줄은 아래 헤더명과 동일해야 합니다. name은 필수입니다."
              validateRow={validateEquipmentRow}
              onImport={importEquipmentCsv}
              disabled={!companyId}
            />

            <div className="md:hidden">
              {equipment.map((row) => {
                const meta = formatMoldChangedMeta(row.mold_changed_at);
                const isDraft = String(row.id).startsWith('draft-');
                return (
                  <MobileListCard key={row.id} header={row.name?.trim() || '새 설비'}>
                    <MobileCardField label="이름" className="col-span-2">
                      <input
                        type="text"
                        value={row.name ?? ''}
                        placeholder="350T 다이캐스팅 #2"
                        disabled={Boolean(saving?.startsWith('eq-'))}
                        className={`${inputClass} w-full`}
                        onChange={(e) => updateEquipmentLocal(row.id, { name: e.target.value })}
                        onBlur={() => saveEquipmentRow(row)}
                      />
                    </MobileCardField>
                    <MobileCardField label="라인">
                      <input
                        type="text"
                        value={row.line ?? ''}
                        disabled={Boolean(saving?.startsWith('eq-'))}
                        className={`${inputClass} w-full`}
                        onChange={(e) => updateEquipmentLocal(row.id, { line: e.target.value })}
                        onBlur={() => saveEquipmentRow(row)}
                      />
                    </MobileCardField>
                    <MobileCardField label="최대 CAPA">
                      <input
                        type="text"
                        value={row.max_capacity ?? ''}
                        disabled={Boolean(saving?.startsWith('eq-'))}
                        className={`${inputClass} w-full`}
                        onChange={(e) =>
                          updateEquipmentLocal(row.id, { max_capacity: e.target.value })
                        }
                        onBlur={() => saveEquipmentRow(row)}
                      />
                    </MobileCardField>
                    <MobileCardField label="설치일" className="col-span-2">
                      <input
                        type="date"
                        value={(row.installed_at ?? '').slice(0, 10)}
                        disabled={Boolean(saving?.startsWith('eq-'))}
                        className={`${inputClass} w-full`}
                        onChange={(e) =>
                          updateEquipmentLocal(row.id, { installed_at: e.target.value || null })
                        }
                        onBlur={() => saveEquipmentRow(row)}
                      />
                    </MobileCardField>
                    <MobileCardField label="현재 금형" className="col-span-2">
                      <select
                        value={row.current_mold_id || ''}
                        disabled={isDraft || Boolean(saving?.startsWith('eq-'))}
                        className={`${inputClass} w-full`}
                        onChange={(e) => changeCurrentMold(row, e.target.value || null)}
                      >
                        <option value="">미지정</option>
                        {productMolds
                          .filter((m) => !String(m.id).startsWith('draft-'))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {moldLabel(m)}
                            </option>
                          ))}
                      </select>
                      <div className="mt-1 text-[11px] text-muted">
                        마지막 교체 {meta.absolute}
                        {meta.hoursAgoLabel ? (
                          <span className="ml-1.5 text-muted">· {meta.hoursAgoLabel}</span>
                        ) : null}
                      </div>
                    </MobileCardField>
                    <MobileCardField label="" className="col-span-2">
                      <button
                        type="button"
                        onClick={() => deleteEquipment(row.id)}
                        className="text-xs text-danger hover:underline"
                      >
                        삭제
                      </button>
                    </MobileCardField>
                  </MobileListCard>
                );
              })}
              {equipment.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">등록된 설비가 없습니다</p>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto rounded-xl bg-surface shadow-card md:block">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                    <th className="px-4 py-3">이름 *</th>
                    <th className="px-4 py-3">라인</th>
                    <th className="px-4 py-3">최대 CAPA</th>
                    <th className="px-4 py-3">설치일</th>
                    <th className="px-4 py-3">현재 금형</th>
                    <th className="px-4 py-3">마지막 교체</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((row) => {
                    const meta = formatMoldChangedMeta(row.mold_changed_at);
                    const isDraft = String(row.id).startsWith('draft-');
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.name ?? ''}
                            placeholder="350T 다이캐스팅 #2"
                            disabled={Boolean(saving?.startsWith('eq-'))}
                            className={`${inputClass} w-full min-w-[10rem]`}
                            onChange={(e) =>
                              updateEquipmentLocal(row.id, { name: e.target.value })
                            }
                            onBlur={() => saveEquipmentRow(row)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.line ?? ''}
                            disabled={Boolean(saving?.startsWith('eq-'))}
                            className={`${inputClass} w-full min-w-[6rem]`}
                            onChange={(e) =>
                              updateEquipmentLocal(row.id, { line: e.target.value })
                            }
                            onBlur={() => saveEquipmentRow(row)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={row.max_capacity ?? ''}
                            disabled={Boolean(saving?.startsWith('eq-'))}
                            className={`${inputClass} w-24`}
                            onChange={(e) =>
                              updateEquipmentLocal(row.id, { max_capacity: e.target.value })
                            }
                            onBlur={() => saveEquipmentRow(row)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={(row.installed_at ?? '').slice(0, 10)}
                            disabled={Boolean(saving?.startsWith('eq-'))}
                            className={`${inputClass} w-full min-w-[9rem]`}
                            onChange={(e) =>
                              updateEquipmentLocal(row.id, {
                                installed_at: e.target.value || null,
                              })
                            }
                            onBlur={() => saveEquipmentRow(row)}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={row.current_mold_id || ''}
                            disabled={isDraft || Boolean(saving?.startsWith('eq-'))}
                            className={`${inputClass} w-full min-w-[11rem]`}
                            onChange={(e) => changeCurrentMold(row, e.target.value || null)}
                          >
                            <option value="">미지정</option>
                            {productMolds
                              .filter((m) => !String(m.id).startsWith('draft-'))
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {moldLabel(m)}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted whitespace-nowrap">
                          <div>{meta.absolute}</div>
                          {meta.hoursAgoLabel ? (
                            <div className="text-muted">{meta.hoursAgoLabel}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            aria-label="삭제"
                            disabled={Boolean(saving?.startsWith('eq-'))}
                            onClick={() => deleteEquipment(row.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:border-danger/40 hover:text-danger disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {equipment.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-xs text-muted">
                        등록된 설비가 없습니다
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === 'product_mold' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-text">제품·금형</h2>
              <button
                type="button"
                disabled={!companyId}
                onClick={() => addProductMoldDraft()}
                className={`inline-flex items-center gap-2 ${btnSecondary}`}
              >
                <Plus className="h-4 w-4" />
                행 추가
              </button>
            </div>

            <CsvImportPanel
              title="CSV 일괄 등록"
              expectedHeaders={PRODUCT_MOLD_CSV_HEADERS}
              headerHelp="product_name, mold_code는 필수입니다."
              validateRow={validateProductMoldRow}
              onImport={importProductMoldCsv}
              disabled={!companyId}
            />

            <div className="md:hidden">
              {productMolds.map((row) => (
                <MobileListCard
                  key={row.id}
                  header={row.product_name?.trim() || '새 제품·금형'}
                >
                  <MobileCardField label="제품명 *" className="col-span-2">
                    <input
                      type="text"
                      value={row.product_name ?? ''}
                      placeholder="Bridge Rod"
                      disabled={Boolean(saving?.startsWith('pm-'))}
                      className={`${inputClass} w-full`}
                      onChange={(e) =>
                        updateProductMoldLocal(row.id, { product_name: e.target.value })
                      }
                      onBlur={() => saveProductMoldRow(row)}
                    />
                  </MobileCardField>
                  <MobileCardField label="금형코드 *" className="col-span-2">
                    <input
                      type="text"
                      value={row.mold_code ?? ''}
                      placeholder="BR-04"
                      disabled={Boolean(saving?.startsWith('pm-'))}
                      className={`${inputClass} w-full`}
                      onChange={(e) =>
                        updateProductMoldLocal(row.id, { mold_code: e.target.value })
                      }
                      onBlur={() => saveProductMoldRow(row)}
                    />
                  </MobileCardField>
                  <MobileCardField label="표준 CT(초)" className="col-span-2">
                    <input
                      type="text"
                      value={row.standard_cycle_time_sec ?? ''}
                      disabled={Boolean(saving?.startsWith('pm-'))}
                      className={`${inputClass} w-full`}
                      onChange={(e) =>
                        updateProductMoldLocal(row.id, {
                          standard_cycle_time_sec: e.target.value,
                        })
                      }
                      onBlur={() => saveProductMoldRow(row)}
                    />
                  </MobileCardField>
                  <MobileCardField label="" className="col-span-2">
                    <button
                      type="button"
                      onClick={() => deleteProductMold(row.id)}
                      className="text-xs text-danger hover:underline"
                    >
                      삭제
                    </button>
                  </MobileCardField>
                </MobileListCard>
              ))}
              {productMolds.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">등록된 제품·금형이 없습니다</p>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto rounded-xl bg-surface shadow-card md:block">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                    <th className="px-4 py-3">제품명 *</th>
                    <th className="px-4 py-3">금형코드 *</th>
                    <th className="px-4 py-3">표준 CT(초)</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {productMolds.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.product_name ?? ''}
                          placeholder="Bridge Rod"
                          disabled={Boolean(saving?.startsWith('pm-'))}
                          className={`${inputClass} w-full min-w-[10rem]`}
                          onChange={(e) =>
                            updateProductMoldLocal(row.id, { product_name: e.target.value })
                          }
                          onBlur={() => saveProductMoldRow(row)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.mold_code ?? ''}
                          placeholder="BR-04"
                          disabled={Boolean(saving?.startsWith('pm-'))}
                          className={`${inputClass} w-full min-w-[8rem]`}
                          onChange={(e) =>
                            updateProductMoldLocal(row.id, { mold_code: e.target.value })
                          }
                          onBlur={() => saveProductMoldRow(row)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.standard_cycle_time_sec ?? ''}
                          disabled={Boolean(saving?.startsWith('pm-'))}
                          className={`${inputClass} w-24`}
                          onChange={(e) =>
                            updateProductMoldLocal(row.id, {
                              standard_cycle_time_sec: e.target.value,
                            })
                          }
                          onBlur={() => saveProductMoldRow(row)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          aria-label="삭제"
                          disabled={Boolean(saving?.startsWith('pm-'))}
                          onClick={() => deleteProductMold(row.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:border-danger/40 hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {productMolds.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-xs text-muted">
                        등록된 제품·금형이 없습니다
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={regenConfirm}
        title="api_key 재발급"
        message="이 회사의 모든 앱을 재빌드해야 합니다. 기존 키는 즉시 무효화됩니다. 계속할까요?"
        confirmLabel={saving === 'company-key' ? '재발급 중...' : '재발급'}
        confirmTone="danger"
        loading={saving === 'company-key'}
        onConfirm={handleRegenerateApiKey}
        onCancel={() => saving !== 'company-key' && setRegenConfirm(false)}
      />
    </div>
  );
}

export default function MasterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>}>
      <MasterPageContent />
    </Suspense>
  );
}
