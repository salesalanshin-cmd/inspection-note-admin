'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCompanyId } from '../lib/company';
import { supabase } from '../lib/supabase';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none';
const btnClass =
  'rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-text disabled:opacity-50';

/** 근태 메일 수신자 CRUD — 이메일은 DB에만, 코드 하드코딩 금지 */
export default function AttendanceMailRecipients() {
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId = await getCompanyId();
      const { data, error: qErr } = await supabase
        .from('attendance_mail_recipient')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (qErr) throw new Error(qErr.message);
      setRows(data || []);
    } catch (err) {
      setError(err?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const companyId = await getCompanyId();
      const { error: insErr } = await supabase.from('attendance_mail_recipient').upsert(
        {
          company_id: companyId,
          email: trimmed,
          display_name: name.trim() || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,email' }
      );
      if (insErr) throw new Error(insErr.message);
      setEmail('');
      setName('');
      await load();
    } catch (err) {
      setError(err?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    try {
      const companyId = await getCompanyId();
      const { error: upErr } = await supabase
        .from('attendance_mail_recipient')
        .update({
          is_active: !row.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (upErr) throw new Error(upErr.message);
      await load();
    } catch (err) {
      setError(err?.message || '변경 실패');
    }
  }

  async function removeRow(row) {
    try {
      const companyId = await getCompanyId();
      const { error: delErr } = await supabase
        .from('attendance_mail_recipient')
        .delete()
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (delErr) throw new Error(delErr.message);
      await load();
    } catch (err) {
      setError(err?.message || '삭제 실패');
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-text">근태 메일 수신자</h2>
      <p className="mb-3 text-xs text-muted">
        일/주/월 근태 엑셀 리포트 수신 주소입니다. 코드에 이메일을 넣지 않습니다.
      </p>
      {error ? (
        <p className="mb-2 text-xs text-danger">{error}</p>
      ) : null}
      <form onSubmit={handleAdd} className="mb-3 flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className={`${inputClass} max-w-xs`}
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="표시 이름(선택)"
          className={`${inputClass} max-w-[10rem]`}
        />
        <button type="submit" className={btnClass} disabled={saving}>
          {saving ? '저장…' : '추가'}
        </button>
      </form>
      {loading ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium text-text">{row.email}</span>
                {row.display_name ? (
                  <span className="ml-2 text-xs text-muted">{row.display_name}</span>
                ) : null}
                {!row.is_active ? (
                  <span className="ml-2 text-[11px] text-warn">비활성</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button" className={btnClass} onClick={() => toggleActive(row)}>
                  {row.is_active ? '끄기' : '켜기'}
                </button>
                <button type="button" className={btnClass} onClick={() => removeRow(row)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-3 py-4 text-xs text-muted">등록된 수신자가 없습니다.</li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
