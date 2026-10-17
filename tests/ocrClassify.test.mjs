import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAndValidateOcrClassifyResponse } from '../lib/ocrClassify.js';
import {
  isOcrEnabled,
  remainingDailyQuota,
  shouldStopForTimeBudget,
  statusAfterFailure,
  getOcrDailyLimit,
  getOcrBatchSize,
  claimPendingRow,
  runOcrClassifyBatch,
  OCR_TIME_BUDGET_MS,
} from '../lib/ocrProcess.js';

describe('parseAndValidateOcrClassifyResponse', () => {
  it('정상 JSON을 검증한다', () => {
    const result = parseAndValidateOcrClassifyResponse(
      '{"doc_type":"inspection","confidence":"high","reason":"체크리스트 양식"}'
    );
    assert.equal(result.docType, 'inspection');
    assert.equal(result.confidence, 'high');
    assert.equal(result.needsReview, false);
    assert.match(result.reason, /체크리스트/);
  });

  it('스키마 밖 doc_type은 other + needsReview', () => {
    const result = parseAndValidateOcrClassifyResponse(
      '{"doc_type":"invoice","confidence":"medium","reason":"영수증"}'
    );
    assert.equal(result.docType, 'other');
    assert.equal(result.needsReview, true);
    assert.equal(result.rawDocType, 'invoice');
  });

  it('빈 응답은 에러', () => {
    assert.throws(() => parseAndValidateOcrClassifyResponse(''), /Empty/);
    assert.throws(() => parseAndValidateOcrClassifyResponse(null), /Empty/);
    assert.throws(() => parseAndValidateOcrClassifyResponse('not json'), /Invalid JSON/);
  });

  it('confidence 이상값은 low로 보정', () => {
    const result = parseAndValidateOcrClassifyResponse(
      '{"doc_type":"5s","confidence":"unknown","reason":"x"}'
    );
    assert.equal(result.docType, '5s');
    assert.equal(result.confidence, 'low');
  });
});

describe('OCR_ENABLED / daily limit / time budget', () => {
  it('OCR_ENABLED=false 이면 비활성', () => {
    assert.equal(isOcrEnabled({ OCR_ENABLED: 'false' }), false);
    assert.equal(isOcrEnabled({ OCR_ENABLED: '' }), false);
    assert.equal(isOcrEnabled({ OCR_ENABLED: 'true' }), true);
  });

  it('runOcrClassifyBatch는 OCR_ENABLED!=true 이면 즉시 종료', async () => {
    const prev = process.env.OCR_ENABLED;
    process.env.OCR_ENABLED = 'false';
    try {
      const result = await runOcrClassifyBatch({
        supabaseAdmin: {
          from() {
            throw new Error('should not touch DB');
          },
        },
      });
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'OCR_ENABLED_not_true');
      assert.equal(result.processed, 0);
    } finally {
      if (prev === undefined) delete process.env.OCR_ENABLED;
      else process.env.OCR_ENABLED = prev;
    }
  });

  it('일일 상한 잔여 계산', () => {
    assert.equal(remainingDailyQuota(0, 200), 200);
    assert.equal(remainingDailyQuota(200, 200), 0);
    assert.equal(remainingDailyQuota(250, 200), 0);
  });

  it('runOcrClassifyBatch는 일일 상한 도달 시 종료', async () => {
    const prevEnabled = process.env.OCR_ENABLED;
    const prevLimit = process.env.OCR_DAILY_LIMIT;
    process.env.OCR_ENABLED = 'true';
    process.env.OCR_DAILY_LIMIT = '5';
    const supabaseAdmin = {
      from(table) {
        if (table === 'ocr_usage') {
          return {
            select() {
              return {
                gte() {
                  return Promise.resolve({ count: 5, error: null });
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    try {
      const result = await runOcrClassifyBatch({ supabaseAdmin });
      assert.equal(result.skipped, true);
      assert.equal(result.reason, 'daily_limit');
      assert.equal(result.processedToday, 5);
      assert.equal(result.dailyLimit, 5);
    } finally {
      if (prevEnabled === undefined) delete process.env.OCR_ENABLED;
      else process.env.OCR_ENABLED = prevEnabled;
      if (prevLimit === undefined) delete process.env.OCR_DAILY_LIMIT;
      else process.env.OCR_DAILY_LIMIT = prevLimit;
    }
  });

  it('기본 env 파싱', () => {
    assert.equal(getOcrDailyLimit({}), 200);
    assert.equal(getOcrDailyLimit({ OCR_DAILY_LIMIT: '10' }), 10);
    assert.equal(getOcrBatchSize({}), 6);
    assert.equal(getOcrBatchSize({ OCR_BATCH_SIZE: '8' }), 8);
  });

  it('시간 예산', () => {
    const start = 1_000_000;
    assert.equal(shouldStopForTimeBudget(start, start + 1000), false);
    assert.equal(
      shouldStopForTimeBudget(start, start + OCR_TIME_BUDGET_MS),
      true
    );
  });
});

describe('실패 재시도 / 잠금', () => {
  it('attempts 3회부터 failed 고정', () => {
    assert.equal(statusAfterFailure(1), 'pending');
    assert.equal(statusAfterFailure(2), 'pending');
    assert.equal(statusAfterFailure(3), 'failed');
    assert.equal(statusAfterFailure(4), 'failed');
  });

  it('동시 실행 잠금: pending이 아니면 claim 실패', async () => {
    const calls = [];
    const supabaseAdmin = {
      from(table) {
        assert.equal(table, 'ocr_results');
        return {
          update(payload) {
            calls.push(payload);
            return {
              eq(col, val) {
                this._filters = this._filters || [];
                this._filters.push([col, val]);
                return this;
              },
              select() {
                return this;
              },
              async maybeSingle() {
                const statusFilter = (this._filters || []).find(
                  ([c, v]) => c === 'status' && v === 'pending'
                );
                // 이미 processing인 행을 흉내: pending 조건이 있어 update 결과 없음
                if (statusFilter) {
                  return { data: null, error: null };
                }
                return { data: { id: 'x' }, error: null };
              },
            };
          },
        };
      },
    };

    const claimed = await claimPendingRow(supabaseAdmin, 'row-1');
    assert.equal(claimed, null);
    assert.deepEqual(calls[0], { status: 'processing' });
  });

  it('동시 실행 잠금: pending이면 claim 성공', async () => {
    const supabaseAdmin = {
      from() {
        return {
          update() {
            return {
              eq() {
                return this;
              },
              select() {
                return this;
              },
              async maybeSingle() {
                return {
                  data: {
                    id: 'row-1',
                    status: 'processing',
                    image_url: 'https://example.invalid/x.jpg',
                    ocr_attempts: 0,
                    company_id: 'c1',
                  },
                  error: null,
                };
              },
            };
          },
        };
      },
    };

    const claimed = await claimPendingRow(supabaseAdmin, 'row-1');
    assert.equal(claimed.id, 'row-1');
    assert.equal(claimed.status, 'processing');
  });
});
