import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { authorizeCron } from '../../../../lib/cronAuth';
import { processRecurredPushNotifications } from '../../../../lib/defectActions';
import { processNextDocument } from '../../../../lib/documents/process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = await getCompanyId();
    const result = await processNextDocument(companyId);

    let recurred = null;
    try {
      recurred = await processRecurredPushNotifications(companyId);
    } catch (recurredErr) {
      // eslint-disable-next-line no-console
      console.error('[process-documents] recurred push', recurredErr);
      recurred = {
        ok: false,
        error: recurredErr?.message || String(recurredErr),
      };
    }

    return NextResponse.json({ ...result, recurred });
  } catch (err) {
    console.error('[process-documents]', err);
    return NextResponse.json(
      { error: err?.message || 'process-documents failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
