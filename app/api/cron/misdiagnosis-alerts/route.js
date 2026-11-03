import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { authorizeCron } from '../../../../lib/cronAuth';
import { processMisdiagnosisAlerts } from '../../../../lib/misdiagnosisAlertJob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 반복 오진 관리자 푸시.
 * 하루 3회(KST 08:10, 13:10, 18:10). 임계값이 3건 간격이라
 * 2분마다 30일 로그를 집계하지 않는다.
 * 문서 처리 cron과 분리되어 있어 여기 실패가 다른 배치를 막지 않는다.
 */
export async function GET(request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = await getCompanyId();
    const result = await processMisdiagnosisAlerts({ companyId });
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cron/misdiagnosis-alerts]', err?.message || err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'misdiagnosis alerts failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
