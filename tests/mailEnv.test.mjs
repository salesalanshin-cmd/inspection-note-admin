import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_MAIL_FROM,
  formatMailMissingError,
  getMailEnvDiagnostics,
  getMissingMailEnvKeys,
  isEnvSet,
  isMailEnabled,
  normalizeMailRecipients,
  resolveMailFrom,
  resolveResendApiKey,
  safeTrim,
} from '../lib/attendance/mailEnv.js';

/**
 * sendAttendanceMail 과 동일한 미설정/수신자 분기 (fetch/엑셀 의존성 없이 검증).
 */
function mailConfigGate(to, env) {
  const missing = getMissingMailEnvKeys(env);
  if (missing.length > 0) {
    return {
      ok: false,
      skipped: true,
      error: formatMailMissingError(missing),
      missing,
      stage: 'env',
    };
  }
  const apiKey = resolveResendApiKey(env);
  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      error: 'RESEND_API_KEY 없음',
      missing: ['RESEND_API_KEY'],
      stage: 'env',
    };
  }
  const recipients = normalizeMailRecipients(to);
  if (!recipients.length) {
    return {
      ok: false,
      skipped: true,
      error: '수신자가 등록되지 않았습니다',
      stage: 'recipient',
    };
  }
  return {
    ok: true,
    apiKeyPresent: true,
    from: resolveMailFrom(env),
    recipients,
    stage: 'send',
  };
}

describe('safeTrim', () => {
  it('undefined/null/비문자열을 빈 문자열로 처리', () => {
    assert.equal(safeTrim(undefined), '');
    assert.equal(safeTrim(null), '');
    assert.equal(safeTrim(''), '');
    assert.equal(safeTrim('   '), '');
    assert.equal(safeTrim('  ab  '), 'ab');
    assert.equal(safeTrim(123), '123');
  });

  it('undefined에서 .trim() TypeError를 내지 않음', () => {
    assert.doesNotThrow(() => safeTrim(undefined));
    assert.doesNotThrow(() => safeTrim(null));
  });
});

describe('isEnvSet / getMissingMailEnvKeys', () => {
  it('trim 후 빈 문자열은 미설정', () => {
    assert.equal(isEnvSet(''), false);
    assert.equal(isEnvSet('   '), false);
    assert.equal(isEnvSet(undefined), false);
    assert.equal(isEnvSet(null), false);
    assert.equal(isEnvSet('re_xxx'), true);
  });

  it('RESEND_API_KEY만 있으면 missing 없음', () => {
    assert.deepEqual(getMissingMailEnvKeys({ RESEND_API_KEY: ' re_test ' }), []);
    assert.equal(isMailEnabled({ RESEND_API_KEY: 're_test' }), true);
  });

  it('env/키가 undefined여도 throw 없이 RESEND 없음', () => {
    assert.deepEqual(getMissingMailEnvKeys(undefined), ['RESEND_API_KEY']);
    assert.deepEqual(getMissingMailEnvKeys(null), ['RESEND_API_KEY']);
    assert.deepEqual(getMissingMailEnvKeys({}), ['RESEND_API_KEY']);
  });
});

describe('resolveMailFrom / resolveResendApiKey', () => {
  it('MAIL_FROM env 우선, 없거나 공백·undefined면 기본값', () => {
    assert.equal(
      resolveMailFrom({ MAIL_FROM: '  custom@example.com  ' }),
      'custom@example.com'
    );
    assert.equal(resolveMailFrom({}), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom({ MAIL_FROM: undefined }), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom({ MAIL_FROM: null }), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom({ MAIL_FROM: '   ' }), DEFAULT_MAIL_FROM);
    assert.equal(resolveMailFrom(undefined), DEFAULT_MAIL_FROM);
  });

  it('RESEND_API_KEY undefined/null/공백 → 빈 문자열', () => {
    assert.equal(resolveResendApiKey({}), '');
    assert.equal(resolveResendApiKey({ RESEND_API_KEY: undefined }), '');
    assert.equal(resolveResendApiKey({ RESEND_API_KEY: null }), '');
    assert.equal(resolveResendApiKey({ RESEND_API_KEY: '  ' }), '');
    assert.equal(resolveResendApiKey(undefined), '');
    assert.equal(resolveResendApiKey({ RESEND_API_KEY: '  re_x  ' }), 're_x');
  });
});

describe('normalizeMailRecipients', () => {
  it('undefined/null/공백 수신자는 제외하고 발송 후보만 남김', () => {
    assert.deepEqual(normalizeMailRecipients(undefined), []);
    assert.deepEqual(normalizeMailRecipients(null), []);
    assert.deepEqual(normalizeMailRecipients([]), []);
    assert.deepEqual(normalizeMailRecipients([undefined, null, '', '  ']), []);
    assert.deepEqual(
      normalizeMailRecipients([undefined, ' a@b.com ', null, '']),
      ['a@b.com']
    );
    assert.deepEqual(normalizeMailRecipients('  solo@x.com '), ['solo@x.com']);
  });
});

describe('getMailEnvDiagnostics', () => {
  it('비밀·주소 값 미출력, MAIL_FROM 기본값 표시', () => {
    const d = getMailEnvDiagnostics({
      RESEND_API_KEY: 're_secret',
      MAIL_FROM: undefined,
      CRON_SECRET: undefined,
      VERCEL_ENV: undefined,
    });
    assert.equal(d.RESEND_API_KEY, '설정됨');
    assert.equal(d.MAIL_FROM, '기본값 사용');
    assert.equal(d.CRON_SECRET, '없음');
    assert.equal(d.VERCEL_ENV, null);
    const json = JSON.stringify(d);
    assert.equal(json.includes('re_secret'), false);
    assert.equal(json.includes(DEFAULT_MAIL_FROM), false);
  });
});

describe('mailConfigGate (env / recipient stages)', () => {
  it('RESEND undefined → stage env, trim 오류 없음', () => {
    const result = mailConfigGate(['a@b.com'], { RESEND_API_KEY: undefined });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'env');
    assert.equal(result.error, 'RESEND_API_KEY 없음');
  });

  it('env 객체 자체가 undefined → stage env', () => {
    const result = mailConfigGate(['a@b.com'], undefined);
    assert.equal(result.stage, 'env');
    assert.equal(result.error, 'RESEND_API_KEY 없음');
  });

  it('수신자 undefined/빈 배열 → stage recipient, 발송 단계 진입 안 함', () => {
    for (const to of [undefined, null, [], [undefined], ['', '  ']]) {
      const result = mailConfigGate(to, { RESEND_API_KEY: 're_test' });
      assert.equal(result.ok, false);
      assert.equal(result.stage, 'recipient');
      assert.equal(result.error, '수신자가 등록되지 않았습니다');
    }
  });

  it('env+수신자 모두 정상 → stage send, from은 기본값 가능', () => {
    const result = mailConfigGate(['a@b.com'], {
      RESEND_API_KEY: 're_test',
      MAIL_FROM: undefined,
    });
    assert.equal(result.ok, true);
    assert.equal(result.stage, 'send');
    assert.equal(result.from, DEFAULT_MAIL_FROM);
    assert.deepEqual(result.recipients, ['a@b.com']);
  });
});
