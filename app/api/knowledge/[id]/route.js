import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { toggleKnowledgeActive, updateKnowledge } from '../../../../lib/knowledgeAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function PATCH(request, { params }) {
  try {
    const companyId = await getCompanyId();
    const id = params.id;
    const body = await request.json();

    if (
      body.isActive !== undefined &&
      body.questionText === undefined &&
      body.answerText === undefined &&
      body.sourceLabel === undefined &&
      body.validUntil === undefined
    ) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive는 boolean이어야 합니다.' }, { status: 400 });
      }
      const knowledge = await toggleKnowledgeActive(companyId, id, body.isActive);
      return NextResponse.json({ knowledge });
    }

    const mode = body.mode === 'supersede' ? 'supersede' : 'overwrite';
    const result = await updateKnowledge(
      companyId,
      id,
      {
        questionText: body.questionText,
        answerText: body.answerText,
        sourceLabel: body.sourceLabel,
        isActive: body.isActive,
        validUntil: body.validUntil,
      },
      mode
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || '수정 실패' }, { status: 500 });
  }
}
