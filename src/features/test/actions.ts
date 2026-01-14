'use server';

export type TestType = 'comment' | 'recomment' | 'cafe-daily';

export type ModelType =
  | 'chatgpt-4o-latest'
  | 'gpt-5.2-2025-12-11'
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview'
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'grok-4-fast-reasoning';

export interface TestRequest {
  type: TestType;
  prompt: string;
  model?: ModelType;
}

export interface TestResult {
  success: boolean;
  content: string;
  model: string;
  elapsed: number;
  error?: string;
}

export interface TestBatchRequest {
  type: TestType;
  prompts: string[];
  model?: ModelType;
  personaId?: string;
}

export interface TestBatchResult {
  success: boolean;
  total: number;
  completed: number;
  failed: number;
  results: TestResult[];
}

const API_BASE = process.env.CONTENT_API_URL || 'http://localhost:8000';

const ENDPOINT_MAP: Record<TestType, string> = {
  comment: '/generate/test/comment',
  recomment: '/generate/test/recomment',
  'cafe-daily': '/generate/test/cafe-daily',
};

const DEFAULT_MODEL_MAP: Record<TestType, ModelType> = {
  comment: 'chatgpt-4o-latest',
  recomment: 'chatgpt-4o-latest',
  'cafe-daily': 'gemini-3-flash-preview',
};

// 단일 테스트 실행
export async function runTestAction(request: TestRequest): Promise<TestResult> {
  const { type, prompt, model } = request;
  const endpoint = ENDPOINT_MAP[type];
  const useModel = model || DEFAULT_MODEL_MAP[type];

  console.log(`[TEST-API] ${type} 요청 - 모델: ${useModel}`);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: useModel }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TEST-API] 에러:`, errorText);
      return {
        success: false,
        content: '',
        model: useModel,
        elapsed: 0,
        error: `API 에러: ${response.status}`,
      };
    }

    const data = await response.json();
    const content = data.content || data.comment || '';

    console.log(`[TEST-API] 성공 - ${data.elapsed}s`);

    return {
      success: true,
      content,
      model: data.model || useModel,
      elapsed: data.elapsed || 0,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[TEST-API] 예외:`, errorMessage);
    return {
      success: false,
      content: '',
      model: useModel,
      elapsed: 0,
      error: errorMessage,
    };
  }
}

// 배치 테스트 실행 (여러 프롬프트)
export async function runTestBatchAction(request: TestBatchRequest): Promise<TestBatchResult> {
  const { type, prompts, model, personaId } = request;
  const useModel = model || DEFAULT_MODEL_MAP[type];

  console.log(`[TEST-BATCH] ${type} 배치 시작 - ${prompts.length}개, 모델: ${useModel}`);

  const results: TestResult[] = [];
  let completed = 0;
  let failed = 0;

  for (const prompt of prompts) {
    // 페르소나 ID가 있으면 프롬프트에 추가
    const finalPrompt = personaId ? `[페르소나: ${personaId}]\n${prompt}` : prompt;

    const result = await runTestAction({ type, prompt: finalPrompt, model: useModel });
    results.push(result);

    if (result.success) {
      completed++;
    } else {
      failed++;
    }
  }

  return {
    success: failed === 0,
    total: prompts.length,
    completed,
    failed,
    results,
  };
}
