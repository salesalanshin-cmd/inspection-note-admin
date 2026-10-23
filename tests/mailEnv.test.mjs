import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MAIL_FROM,
  formatMailMissingError,
  getMailEnvDiagnostics,
  getMissingMailEnvKeys,
  isEnvSet,
  isMailEnabled,
  resolveMailFrom,
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

  it('RESEND_API_KEY만 있으면 missing 없음 (MAIL_FROM 기본값)', () => {
    assert.deepEqual(
      getMissingMailEnvKeys({
        RESEND_API_KEY: ' re_test ',
        MAIL_FROM: '',
      }),
      []
    );
    assert.equal(
      isMailEnabled({
        RESEND_API_KEY: 're_test',
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

  it('MAIL_FROM만 없어도 missing에 넣지 않음', () => {
    assert.deepEqual(
      getMissingMailEnvKeys({
        RESEND_API_KEY: 're_test',
        MAIL_FROM: '',
      }),
      []
    );
    assert.deepEqual(
      getMissingMailEnvKeys({
        RESEND_API_KEY: 're_test',
      }),
      []
    );
  });

  it('RESEND_API_KEY 없으면 MAIL_FROM 유무와 무관하게 RESEND만', () => {
    assert.deepEqual(getMissingMailEnvKeys({}), ['RESEND_API_KEY']);
    assert.deepEqual(
      getMissingMailEnvKeys({ MAIL_FROM: 'a@b.com' }),
      ['RESEND_API_KEY']
    );
  });
});

describe('resolveMailFrom', () => {
  it('환경변수 있으면 그 값(trim) 우선', () => {
    assert.equal(
      resolveMailFrom({ MAIL_FROM: '  custom@example.com  ' }),
      'custom@example.com'
    );
  });

  it('없거나 공백이면 기본값', () => {
    assert.equal(resolveMailFrom({}), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom({ MAIL_FROM: '' }), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom({ MAIL_FROM: '   ' }), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom({ MAIL_FROM: undefined }), DEFAULT_MAIL_FROM);
    assert.equal(DEFAULT_MAIL_FROM, 'noreply@soonanlabs.com');
  });
});

describe('formatMailMissingError', () => {
  it('변수별 문구 (값 미포함)', () => {
    assert.equal(formatMailMissingError(['RESEND_API_KEY']), 'RESEND_API_KEY 없음');
    const msg = formatMailMissingError(['RESEND_API_KEY']);
    assert.equal(msg.includes('re_'), false);
    assert.equal(msg.includes('sk_'), false);
  });
});

describe('getMailEnvDiagnostics', () => {
  it('MAIL_FROM env 있음 → 설정됨, 비밀 값 미출력', () => {
    const d = getMailEnvDiagnostics({
      RESEND_API_KEY: 're_secret_should_not_leak',
      MAIL_FROM: 'noreply@custom.com',
      CRON_SECRET: ' cron ',
      VERCEL_ENV: 'preview',
    });
    assert.deepEqual(d, {
      RESEND_API_KEY: '설정됨',
      MAIL_FROM: '설정됨',
      CRON_SECRET: '설정됨',
      VERCEL_ENV: 'preview',
    });
    const json = JSON.stringify(d);
    assert.equal(json.includes('re_secret'), false);
    assert.equal(json.includes('noreply@custom.com'), false);
    assert.equal(json.includes('cron'), false);
  });

  it('MAIL_FROM 없음/공백 → 기본값 사용 (주소 미출력)', () => {
    for (const mailFrom of [undefined, '', '   ']) {
      const d = getMailEnvDiagnostics({
        RESEND_API_KEY: 'x',
        MAIL_FROM: mailFrom,
        CRON_SECRET: 'z',
      });
      assert.equal(d.MAIL_FROM, '기본값 사용');
      assert.equal(JSON.stringify(d).includes(DEFAULT_MAIL_FROM), false);
      assert.equal(JSON.stringify(d).includes('soonanlabs'), false);
    }
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

  it('MAIL_FROM만 없어도 skip 하지 않음', () => {
    assert.equal(mailConfigSkip({ RESEND_API_KEY: 're_test' }), null);
    assert.equal(mailConfigSkip({ RESEND_API_KEY: 're_test', MAIL_FROM: '' }), null);
    assert.equal(mailConfigSkip({ RESEND_API_KEY: 're_test', MAIL_FROM: '  ' }), null);
  });

  it('둘 다 없으면 RESEND만 오류', () => {
    const result = mailConfigSkip({});
    assert.equal(result.error, 'RESEND_API_KEY 없음');
    assert.deepEqual(result.missing, ['RESEND_API_KEY']);
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
