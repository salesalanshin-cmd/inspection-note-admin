'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleAlert, ClipboardCheck, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import styles from './Login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || !password) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError({ message: data.error || '로그인에 실패했습니다.', invalidPassword: res.status === 401 });
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError({ message: '로그인 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.identity}>
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-white">
              <ClipboardCheck size={24} strokeWidth={2} aria-hidden="true" />
            </span>
            주식회사 디케이메탈
          </div>
          <p className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">검사노트</p>
        </div>

        <div className={styles.formPane}>
          <h1 id="login-title" className="text-2xl font-bold tracking-tight text-text sm:text-3xl">관리자 로그인</h1>
          <form onSubmit={handleSubmit} aria-labelledby="login-title" className="mt-6 border-t border-border pt-6 sm:mt-7 sm:pt-7">
            <label htmlFor="password" className="mb-2 block text-base font-semibold text-text">
              관리자 비밀번호
            </label>
            <div className="relative">
              <LockKeyhole size={19} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={loading}
                required
                aria-invalid={error?.invalidPassword || undefined}
                aria-describedby={error ? 'login-error' : undefined}
                className={`min-h-14 w-full rounded-xl border bg-surface py-3 pl-11 pr-14 text-base text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40 ${error?.invalidPassword ? 'border-danger' : 'border-slate-400'}`}
              />
              <button
                type="button"
                aria-label="비밀번호 표시"
                aria-pressed={showPassword}
                aria-controls="password"
                title={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-surface2 hover:text-text"
              >
                {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
              </button>
            </div>

            {error && (
              <div id="login-error" role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-dangerSoft px-3 py-2.5 text-sm font-medium text-danger">
                <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-base font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-muted disabled:brightness-100"
            >
              {loading ? <LoaderCircle size={19} className="motion-safe:animate-spin" aria-hidden="true" /> : null}
              {loading ? '로그인 중…' : '로그인'}
              {!loading && <ArrowRight size={19} aria-hidden="true" />}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
