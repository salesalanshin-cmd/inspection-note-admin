import { NextResponse } from 'next/server';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * 업로드 API 공통 에러 응답
 * - error: 사용자용 문구 (항상)
 * - message: 원본 에러 (개발 환경만)
 */
export function uploadErrorResponse(rawError, userMessage, status = 500, extra = {}) {
  const message = String(rawError || '').trim() || userMessage;
  console.error('[documents/upload]', message, extra.context || '');
  const { public: publicFields = {}, context: _context, ...rest } = extra;
  return NextResponse.json(
    {
      error: userMessage,
      ...(IS_DEV ? { message } : {}),
      ...publicFields,
      ...rest,
    },
    { status }
  );
}

export function isUploadDev() {
  return IS_DEV;
}
