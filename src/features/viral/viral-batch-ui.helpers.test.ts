import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBatchProgress,
  getCompletionMetrics,
  getExecutionReadiness,
  getImageSummary,
  getRoleCounts,
  getRunReadiness,
  parseKeywordLines,
} from './viral-batch-ui.helpers';

test('parseKeywordLines trims whitespace and removes empty rows', () => {
  const lines = parseKeywordLines('\n  첫째  \n\n둘째:건강  \n   \n셋째:일상\n');

  assert.deepEqual(lines, ['첫째', '둘째:건강', '셋째:일상']);
});

test('getRoleCounts derives writer, commenter, and active counts from account roles', () => {
  const counts = getRoleCounts(
    [
      { id: 'writer-only', password: 'x' },
      { id: 'comment-only', password: 'x' },
      { id: 'both', password: 'x' },
      { id: 'disabled', password: 'x' },
    ],
    new Map([
      ['writer-only', 'writer'],
      ['comment-only', 'commenter'],
      ['both', 'both'],
      ['disabled', 'disabled'],
    ])
  );

  assert.deepEqual(counts, {
    activeCount: 3,
    writerCount: 2,
    commenterCount: 2,
  });
});

test('getImageSummary returns readable labels for image settings', () => {
  assert.equal(getImageSummary(false, 'search', 0), '사용 안함');
  assert.equal(getImageSummary(true, 'search', 0), '구글 검색 · 랜덤 1~2장');
  assert.equal(getImageSummary(true, 'ai', 3), 'AI 생성 · 3장');
});

test('getExecutionReadiness blocks execution when required inputs are missing', () => {
  const readiness = getExecutionReadiness({
    activeCount: 1,
    commenterCount: 0,
    keywordCount: 0,
    selectedCafeCount: 0,
    writerCount: 1,
  });

  assert.equal(readiness.status, 'blocked');
  assert.deepEqual(readiness.blockers, [
    '실행 대상 키워드 확보',
    '배포할 카페 지정',
    '댓글 흐름 계정 배정',
  ]);
});

test('getExecutionReadiness warns when required inputs exist but operational slack is low', () => {
  const readiness = getExecutionReadiness({
    activeCount: 1,
    commenterCount: 1,
    keywordCount: 4,
    selectedCafeCount: 2,
    writerCount: 1,
  });

  assert.equal(readiness.status, 'attention');
  assert.deepEqual(readiness.cautions, ['운영 여유 계정 확보']);
});

test('getBatchProgress summarizes partial results', () => {
  const progress = getBatchProgress([
    { keyword: '첫째', success: true },
    { keyword: '둘째', success: false, error: '실패' },
    { keyword: '셋째', success: true },
  ]);

  assert.deepEqual(progress, {
    failureCount: 1,
    processedCount: 3,
    successCount: 2,
    successRatio: 2 / 3,
  });
});

test('getCompletionMetrics derives processed, pending, and progress values', () => {
  const metrics = getCompletionMetrics(
    [
      { keyword: '첫째', success: true },
      { keyword: '둘째', success: false, error: '실패' },
      { keyword: '셋째', success: true },
    ],
    5
  );

  assert.deepEqual(metrics, {
    failureCount: 1,
    pendingCount: 2,
    processedCount: 3,
    progressPercent: 60,
    successCount: 2,
  });
});

test('getRunReadiness reflects missing setup, running, and ready states', () => {
  assert.deepEqual(
    getRunReadiness({
      commenterCount: 1,
      isPending: false,
      keywordCount: 0,
      selectedCafeCount: 1,
      writerCount: 1,
    }),
    {
      tone: 'attention',
      label: '키워드 필요',
      description: '직접 입력하거나 AI 생성으로 실행 대상을 먼저 채워야 합니다.',
    }
  );

  assert.deepEqual(
    getRunReadiness({
      commenterCount: 2,
      isPending: true,
      keywordCount: 12,
      selectedCafeCount: 2,
      writerCount: 2,
    }),
    {
      tone: 'running',
      label: '실행 중',
      description: '현재 배치가 진행 중입니다. 라이브 로그와 결과 보드를 확인하세요.',
    }
  );

  assert.deepEqual(
    getRunReadiness({
      commenterCount: 2,
      isPending: false,
      keywordCount: 12,
      selectedCafeCount: 2,
      writerCount: 2,
    }),
    {
      tone: 'ready',
      label: '실행 준비 완료',
      description: '입력, 대상, 계정 구성이 준비되었습니다. 실행 후 로그에서 바로 확인할 수 있습니다.',
    }
  );
});
