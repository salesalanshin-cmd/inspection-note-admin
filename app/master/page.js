'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import CsvImportPanel, { inputClass } from '../../components/CsvImportPanel';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';

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
  const prefillApplied = useRef(false);

  const companyId = company?.id ?? null;

  const fetchAll = useCallback(async () => {
    setError(null);
    const [companyRes, equipmentRes, moldRes] = await Promise.all([
      supabase.from('company').select('*').order('created_at', { ascending: true }).limit(1),
      supabase.from('equipment').select('*').order('name'),
      supabase.from('product_mold').select('*').order('product_name'),
    ]);

    if (companyRes.error) throw new Error(companyRes.error.message);
    if (equipmentRes.error) throw new Error(equipmentRes.error.message);
    if (moldRes.error) throw new Error(moldRes.error.message);

    const co = companyRes.data?.[0] ?? null;
    setCompany(co);
    setCompanyName(co?.name ?? '');
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
    setSaving('company');
    setFormError(null);
    if (company?.id) {
      const { error: updateError } = await supabase
        .from('company')
        .update({ name })
        .eq('id', company.id);
      setSaving(null);
      if (updateError) {
        setFormError(updateError.message);
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('company')
        .insert({ name })
        .select()
        .single();
      setSaving(null);
      if (insertError) {
        setFormError(insertError.message);
        return;
      }
      setCompany(data);
    }
    await fetchAll();
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
      ({ error: dbError } = await supabase.from('equipment').update(payload).eq('id', row.id));
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
    const { error: delError } = await supabase.from('equipment').delete().eq('id', id);
    setSaving(null);
    if (delError) {
      setFormError(delError.message);
      return;
    }
    await fetchAll();
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
      ({ error: dbError } = await supabase.from('product_mold').update(payload).eq('id', row.id));
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
    const { error: delError } = await supabase.from('product_mold').delete().eq('id', id);
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
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-text">회사</h2>
            <p className="text-xs text-muted">
              현재는 1개 회사만 등록합니다. 등록 후 설비·제품·금형에 자동 연결됩니다.
            </p>
            <div className="max-w-md space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted">회사 이름</span>
                <input
                  type="text"
                  value={companyName}
                  disabled={saving === 'company'}
                  placeholder="(주)디케이메탈"
                  className={`${inputClass} w-full`}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={handleSaveCompany}
                disabled={!companyName.trim() || saving === 'company'}
                className={btnPrimary}
              >
                {company ? '이름 저장' : '회사 등록'}
              </button>
              {company ? (
                <p className="text-xs text-muted">
                  등록됨 · ID <span className="font-mono">{company.id}</span>
                </p>
              ) : null}
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
              {equipment.map((row) => (
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
              ))}
              {equipment.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">등록된 설비가 없습니다</p>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto rounded-xl bg-surface shadow-card md:block">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                    <th className="px-4 py-3">이름 *</th>
                    <th className="px-4 py-3">라인</th>
                    <th className="px-4 py-3">최대 CAPA</th>
                    <th className="px-4 py-3">설치일</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.name ?? ''}
                          placeholder="350T 다이캐스팅 #2"
                          disabled={Boolean(saving?.startsWith('eq-'))}
                          className={`${inputClass} w-full min-w-[10rem]`}
                          onChange={(e) => updateEquipmentLocal(row.id, { name: e.target.value })}
                          onBlur={() => saveEquipmentRow(row)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.line ?? ''}
                          disabled={Boolean(saving?.startsWith('eq-'))}
                          className={`${inputClass} w-full min-w-[6rem]`}
                          onChange={(e) => updateEquipmentLocal(row.id, { line: e.target.value })}
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
                  ))}
                  {equipment.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted">
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
