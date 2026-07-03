import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { INSIGHT_LAB_MODEL } from '../../../lib/constants';
import {
  AI_CONSOLE_SYSTEM_PROMPT,
  AI_CONSOLE_TOOL_DEFINITIONS,
  executeAiConsoleTool,
} from '../../../lib/aiConsoleTools';

const MAX_TOOL_LOOPS = 5;

function extractText(content) {
  return (content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function isQueryResult(result) {
  return result && Array.isArray(result.rows) && Array.isArray(result.columns);
}

export const maxDuration = 60;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '인사이트 랩을 사용할 수 없습니다. 관리자에게 문의하세요.' },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });
  const conversation = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? ''),
  }));

  let lastQueryResult = null;

  try {
    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
      const response = await client.messages.create({
        model: INSIGHT_LAB_MODEL,
        max_tokens: 4096,
        system: AI_CONSOLE_SYSTEM_PROMPT,
        tools: AI_CONSOLE_TOOL_DEFINITIONS,
        messages: conversation,
      });

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        return NextResponse.json({
          reply: extractText(response.content) || '답변을 생성하지 못했습니다.',
          data: lastQueryResult?.rows ?? null,
          columns: lastQueryResult?.columns ?? null,
        });
      }

      if (response.stop_reason === 'tool_use') {
        conversation.push({ role: 'assistant', content: response.content });

        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          try {
            const result = await executeAiConsoleTool(block.name, block.input);
            if (isQueryResult(result)) {
              lastQueryResult = result;
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (toolErr) {
            // eslint-disable-next-line no-console
            console.error('[insight-lab tool]', block.name, toolErr);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ error: toolErr.message || 'Tool failed' }),
              is_error: true,
            });
          }
        }

        conversation.push({ role: 'user', content: toolResults });
        continue;
      }

      return NextResponse.json({
        reply: extractText(response.content) || '처리를 완료하지 못했습니다.',
        data: lastQueryResult?.rows ?? null,
        columns: lastQueryResult?.columns ?? null,
      });
    }

    return NextResponse.json({
      reply: '조회 요청이 너무 복잡합니다. 질문을 더 단순하게 나눠 주세요.',
      data: lastQueryResult?.rows ?? null,
      columns: lastQueryResult?.columns ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[insight-lab]', err);
    return NextResponse.json(
      { error: '인사이트 랩을 사용할 수 없습니다. 관리자에게 문의하세요.' },
      { status: 500 }
    );
  }
}
