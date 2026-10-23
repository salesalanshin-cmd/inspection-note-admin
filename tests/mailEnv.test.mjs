import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatMailMissingError,
  getMailEnvDiagnostics,
  getMissingMailEnvKeys,
  isEnvSet,
  isMailEnabled,
} from '../lib/attendance/mailEnv.js';

/**
 * sendAttendanceMail 과 동일한 미설정 분기 (fetch/엑셀 의존성 없이 검증).
 * @returns {{ ok: false, skipped: true, error: string, missing: string[] } | null}
 */
function mailConfigSkip(env) {
  const missing = getMissingMailEnvKeys(env);
  if (missing.length === 0) return null;
  return {
    ok: false,
    skipped: true,
    error: formatMailMissingError(missing),
    missing,
  };
}

describe('isEnvSet / getMissingMailEnvKeys', () => {
  it('trim 후 빈 문자열은 미설정', () => {
    assert.equal(isEnvSet(''), false);
    assert.equal(isEnvSet('   '), false);
    assert.equal(isEnvSet(undefined), false);
    assert.equal(isEnvSet(null), false);
    assert.equal(isEnvSet('re_xxx'), true);
    assert.equal(isEnvSet('  re_xxx  '), true);
  });

  it('둘 다 있으면 missing 없음', () => {
    assert.deepEqual(
      getMissingMailEnvKeys({
        RESEND_API_KEY: ' re_test ',
        MAIL_FROM: ' noreply@example.com ',
      }),
      []
    );
    assert.equal(
      isMailEnabled({
        RESEND_API_KEY: 're_test',
        MAIL_FROM: 'noreply@example.com',
      }),
      true
    );
  });

  it('RESEND_API_KEY만 없으면 해당 키만', () => {
    assert.deepEqual(
      getMissingMailEnvKeys({
        RESEND_API_KEY: '  ',
        MAIL_FROM: 'a@b.com',
      }),
      ['RESEND_API_KEY']
    );
  });

  it('MAIL_FROM만 없으면 해당 키만', () => {
    assert.deepEqual(
      getMissingMailEnvKeys({
        RESEND_API_KEY: 're_test',
        MAIL_FROM: '',
      }),
      ['MAIL_FROM']
    );
  });

  it('둘 다 없으면 둘 다', () => {
    assert.deepEqual(getMissingMailEnvKeys({}), [
      'RESEND_API_KEY',
      'MAIL_FROM',
    ]);
  });
});

describe('formatMailMissingError', () => {
  it('변수별 문구 (값 미포함)', () => {
    assert.equal(formatMailMissingError(['RESEND_API_KEY']), 'RESEND_API_KEY 없음');
    assert.equal(formatMailMissingError(['MAIL_FROM']), 'MAIL_FROM 없음');
    assert.equal(
      formatMailMissingError(['RESEND_API_KEY', 'MAIL_FROM']),
      'RESEND_API_KEY 없음 / MAIL_FROM 없음'
    );
    const msg = formatMailMissingError(['RESEND_API_KEY']);
    assert.equal(msg.includes('re_'), false);
    assert.equal(msg.includes('sk_'), false);
  });
});

describe('getMailEnvDiagnostics', () => {
  it('설정됨/없음과 VERCEL_ENV만 반환하고 비밀 값은 넣지 않음', () => {
    const d = getMailEnvDiagnostics({
      RESEND_API_KEY: 're_secret_should_not_leak',
      MAIL_FROM: '',
      CRON_SECRET: ' cron ',
      VERCEL_ENV: 'preview',
    });
    assert.deepEqual(d, {
      RESEND_API_KEY: '설정됨',
      MAIL_FROM: '없음',
      CRON_SECRET: '설정됨',
      VERCEL_ENV: 'preview',
    });
    const json = JSON.stringify(d);
    assert.equal(json.includes('re_secret'), false);
    assert.equal(json.includes('cron'), false);
  });

  it('VERCEL_ENV 미설정 시 null', () => {
    const d = getMailEnvDiagnostics({
      RESEND_API_KEY: 'x',
      MAIL_FROM: 'y',
      CRON_SECRET: 'z',
    });
    assert.equal(d.VERCEL_ENV, null);
    assert.equal(d.CRON_SECRET, '설정됨');
  });
});

describe('sendAttendanceMail mail env errors', () => {
  it('RESEND_API_KEY 없음 메시지', () => {
    const result = mailConfigSkip({ MAIL_FROM: 'from@example.com' });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, true);
    assert.equal(result.error, 'RESEND_API_KEY 없음');
    assert.deepEqual(result.missing, ['RESEND_API_KEY']);
  });

  it('MAIL_FROM 없음 메시지', () => {
    const result = mailConfigSkip({ RESEND_API_KEY: 're_test' });
    assert.equal(result.error, 'MAIL_FROM 없음');
    assert.deepEqual(result.missing, ['MAIL_FROM']);
  });

  it('둘 다 없으면 둘 다 표시', () => {
    const result = mailConfigSkip({});
    assert.equal(result.error, 'RESEND_API_KEY 없음 / MAIL_FROM 없음');
  });

  it('둘 다 있으면 skip null', () => {
    assert.equal(
      mailConfigSkip({
        RESEND_API_KEY: 're_test',
        MAIL_FROM: 'a@b.com',
      }),
      null
    );
  });
});
