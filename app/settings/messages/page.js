'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  getDisplayName,
  getWorkDateForRecord,
} from '../../../lib/analytics';
import { getRecentDaysRange, formatISODate } from '../../../lib/dateRange';
import { useReports } from '../../../lib/useReports';
import PageHeader from '../../../components/PageHeader';
import DateRangePicker from '../../../components/DateRangePicker';

const TEMPLATE_LABELS = {
  frequent_check: '자주검사',
  fives: '3정5S',
  document: '문서스캔',
  combined: '복합',
  daily_summary: '종합',
  correction: '정정',
};

const AUTO_SETTING_DEFS = [
  {
    key: 'frequent_check_auto_send',
    title: '초/중/종 자주검사 자동발송',
    description:
      '시간대가 지났는데 자주검사 미실시인 담당자에게 알림톡을 자동 발송합니다. (15분마다 크론)',
    ready: true,
  },
  {
    key: 'fives_auto_send',
    title: '3정5S 자동발송',
    description:
      '토글은 저장되지만 실제 자동화 로직은 아직 없습니다. 준비 중입니다.',
    ready: false,
  },
  {
    key: 'defect_auto_send',
    title: '불량기록 자동발송',
    description:
      '토글은 저장되지만 실제 자동화 로직은 아직 없습니다. 준비 중입니다.',
    ready: false,
  },
  {
    key: 'document_auto_send',
    title: '문서스캔 자동발송',
    description:
      '토글은 저장되지만 실제 자동화 로직은 아직 없습니다. 준비 중입니다.',
    ready: false,
  },
];

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function logTimestamp(row) {
  return row.sent_at || row.created_at;
}

function workDayBounds(now = new Date()) {
  const workDateStr = getWorkDateForRecord(now);
  const start = new Date(`${workDateStr}T08:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, workDateStr };
}

function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-border'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function MessagesSettingsPage() {
  const { workerDirectory } = useReports();
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState(null);
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(7));
  const [statusFilter, setStatusFilter] = useState('all');
  const [workerQuery, setWorkerQuery] = useState('');
  const [settings, setSettings] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    setLogsError(null);
    const { data, error } = await supabase
      .from('notification_send_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      setLogsError(error.message);
      setLogs([]);
    } else {
      setLogs(data || []);
    }
    setLoadingLogs(false);
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    const { data, error } = await supabase.from('automation_settings').select('*');
    if (!error && data) {
      const map = {};
      for (const row of data) {
        map[row.key] = row;
      }
      setSettings(map);
    }
    setSettingsLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
    loadSettings();
  }, [loadLogs, loadSettings]);

  const todaySummary = useMemo(() => {
    const { start, end } = workDayBounds();
    const todayLogs = logs.filter((row) => {
      const ts = logTimestamp(row);
      if (!ts) return false;
      const t = new Date(ts);
      return t >= start && t < end;
    });
    const sent = todayLogs.filter((r) => r.status === 'sent').length;
    const failed = todayLogs.filter((r) => r.status === 'failed').length;
    const recent = [...todayLogs]
      .sort((a, b) => new Date(logTimestamp(b)) - new Date(logTimestamp(a)))
      .slice(0, 10);
    return { total: todayLogs.length, sent, failed, recent };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = workerQuery.trim().toLowerCase();
    return logs.filter((row) => {
      const ts = logTimestamp(row);
      if (ts && dateRange.start && dateRange.end) {
        const key = formatISODate(ts);
        if (key < dateRange.start || key > dateRange.end) return false;
      }
      if (statusFilter === 'sent' && row.status !== 'sent') return false;
      if (statusFilter === 'failed' && row.status !== 'failed') return false;
      if (q) {
        const name = (row.worker_name || '').toLowerCase();
        const display = getDisplayName(row.worker_name, workerDirectory).toLowerCase();
        if (!name.includes(q) && !display.includes(q)) return false;
      }
      return true;
    });
  }, [logs, dateRange, statusFilter, workerQuery, workerDirectory]);

  async function handleToggle(key, nextEnabled) {
    if (togglingKey) return;
    setTogglingKey(key);
    const prev = settings[key];
    setSettings((s) => ({
      ...s,
      [key]: {
        ...(s[key] || { key }),
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      },
    }));

    const { error } = await supabase
      .from('automation_settings')
      .update({ enabled: nextEnabled, updated_at: new Date().toISOString() })
      .eq('key', key);

    if (error) {
      window.alert(error.message || '설정 저장에 실패했습니다.');
      setSettings((s) => ({ ...s, [key]: prev }));
    }
    setTogglingKey(null);
  }

  async function handleResend(row) {
    if (resendingId || row.status !== 'failed') return;
    const ok = window.confirm(
      `${getDisplayName(row.worker_name, workerDirectory)}님에게 다시 알림톡을 발송할까요?`
    );
    if (!ok) return;

    setResendingId(row.id);
    try {
      const phone =
        row.phone_number ||
        workerDirectory.find((w) => w.worker_name === row.worker_name)?.phone_number ||
        '';
      const templateType = row.template_type || 'frequent_check';
      const displayName = getDisplayName(row.worker_name, workerDirectory);
      const variables =
        templateType === 'frequent_check'
          ? { 작업자명: displayName, 미실시항목: '초/중/종' }
          : { 작업자명: displayName };

      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: [
            {
              workerName: row.worker_name,
              phoneNumber: phone,
              templateType,
              variables,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error || '재발송에 실패했습니다.');
      } else {
        const result = data.results?.[0];
        if (result && !result.success) {
          window.alert(result.error || '재발송에 실패했습니다.');
        }
        await loadLogs();
      }
    } catch (err) {
      window.alert(err?.message || '재발송 중 오류가 발생했습니다.');
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <PageHeader
        eyebrow="SETTINGS"
        title="메시지 관리"
        description="알림톡 발송 현황과 AI 자동발송 설정을 관리합니다. 자동발송은 기본 꺼짐 상태입니다."
      />

      <div className="space-y-8 px-4 py-6 md:px-8">
        {/* 오늘 발송 현황 */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text">오늘 발송 현황</h2>
            <button
              type="button"
              onClick={loadLogs}
              disabled={loadingLogs}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
            >
              {loadingLogs ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              새로고침
            </button>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-lg font-semibold text-text">
              오늘 발송 {todaySummary.total}건
              <span className="ml-2 text-sm font-medium text-muted">
                (성공 {todaySummary.sent} / 실패 {todaySummary.failed})
              </span>
            </p>
            {todaySummary.recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted">오늘 발송 기록이 없습니다.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {todaySummary.recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="font-medium text-text">
                      {getDisplayName(row.worker_name, workerDirectory)}
                    </span>
                    <span className="text-xs text-muted">{formatDateTime(logTimestamp(row))}</span>
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-muted">
                      {TEMPLATE_LABELS[row.template_type] || row.template_type || '—'}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        row.status === 'sent' ? 'text-good' : 'text-danger'
                      }`}
                    >
                      {row.status === 'sent' ? '성공' : '실패'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* AI 자동발송 토글 */}
        <section>
          <h2 className="mb-1 text-sm font-semibold text-text">AI 자동발송</h2>
          <p className="mb-3 text-xs text-muted">
            토글이 꺼진 상태가 기본값입니다. 켤 때만 실제 카카오톡이 발송될 수 있습니다.
          </p>
          {settingsLoading ? (
            <p className="text-sm text-muted">설정 불러오는 중…</p>
          ) : (
            <div className="space-y-3">
              {AUTO_SETTING_DEFS.map((def) => {
                const enabled = Boolean(settings[def.key]?.enabled);
                return (
                  <div
                    key={def.key}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-text">{def.title}</span>
                        {!def.ready ? (
                          <span className="rounded-full bg-warnSoft px-2 py-0.5 text-[11px] font-medium text-warn">
                            준비 중
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        {def.description}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={enabled}
                      disabled={togglingKey === def.key}
                      label={def.title}
                      onChange={(next) => handleToggle(def.key, next)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 발송 이력 */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">발송 이력</h2>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="all">전체 상태</option>
                <option value="sent">성공만</option>
                <option value="failed">실패만</option>
              </select>
              <input
                type="search"
                value={workerQuery}
                onChange={(e) => setWorkerQuery(e.target.value)}
                placeholder="작업자 검색"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          {logsError ? (
            <p className="text-sm text-danger">{logsError}</p>
          ) : loadingLogs ? (
            <p className="text-sm text-muted">이력 불러오는 중…</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-surface2 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">작업자</th>
                      <th className="px-3 py-2 font-medium">템플릿</th>
                      <th className="px-3 py-2 font-medium">전화번호</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium">실패사유</th>
                      <th className="px-3 py-2 font-medium">발송시각</th>
                      <th className="px-3 py-2 font-medium"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-muted">
                          조건에 맞는 이력이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-text">
                            {getDisplayName(row.worker_name, workerDirectory)}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {TEMPLATE_LABELS[row.template_type] || row.template_type || '—'}
                          </td>
                          <td className="px-3 py-2 text-muted">{row.phone_number || '—'}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`text-xs font-medium ${
                                row.status === 'sent' ? 'text-good' : 'text-danger'
                              }`}
                            >
                              {row.status === 'sent' ? '성공' : '실패'}
                            </span>
                          </td>
                          <td className="max-w-[14rem] break-words px-3 py-2 text-xs text-muted">
                            {row.status === 'failed' ? row.error_message || '—' : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                            {formatDateTime(logTimestamp(row))}
                          </td>
                          <td className="px-3 py-2">
                            {row.status === 'failed' ? (
                              <button
                                type="button"
                                onClick={() => handleResend(row)}
                                disabled={resendingId === row.id}
                                className="rounded-xl border border-border px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50"
                              >
                                {resendingId === row.id ? '발송 중…' : '재발송'}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {filteredLogs.length === 0 ? (
                  <p className="text-sm text-muted">조건에 맞는 이력이 없습니다.</p>
                ) : (
                  filteredLogs.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-border bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-text">
                          {getDisplayName(row.worker_name, workerDirectory)}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            row.status === 'sent' ? 'text-good' : 'text-danger'
                          }`}
                        >
                          {row.status === 'sent' ? '성공' : '실패'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {TEMPLATE_LABELS[row.template_type] || row.template_type || '—'} ·{' '}
                        {row.phone_number || '연락처 없음'}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {formatDateTime(logTimestamp(row))}
                      </p>
                      {row.status === 'failed' && row.error_message ? (
                        <p className="mt-1 break-words text-xs text-danger">
                          {row.error_message}
                        </p>
                      ) : null}
                      {row.status === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => handleResend(row)}
                          disabled={resendingId === row.id}
                          className="mt-3 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text disabled:opacity-50"
                        >
                          {resendingId === row.id ? '발송 중…' : '재발송'}
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
