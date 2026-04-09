import type { AccountData } from '@/features/accounts/actions';

export type AccountRole = 'both' | 'writer' | 'commenter' | 'disabled';

export interface ViralPartialResult {
  keyword: string;
  success: boolean;
  title?: string;
  error?: string;
}

export interface CompletionMetrics {
  processedCount: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  progressPercent: number;
}

interface RoleCounts {
  activeCount: number;
  writerCount: number;
  commenterCount: number;
}

interface RunReadinessInput {
  commenterCount: number;
  isPending: boolean;
  keywordCount: number;
  selectedCafeCount: number;
  writerCount: number;
}

export interface RunReadiness {
  tone: 'ready' | 'attention' | 'running';
  label: string;
  description: string;
}

interface ExecutionReadinessInput {
  activeCount: number;
  commenterCount: number;
  keywordCount: number;
  selectedCafeCount: number;
  writerCount: number;
}

interface ExecutionReadinessCheck {
  description: string;
  label: string;
  ok: boolean;
  required: boolean;
  value: string;
}

export interface ExecutionReadiness {
  blockers: string[];
  cautions: string[];
  checks: ExecutionReadinessCheck[];
  description: string;
  headline: string;
  readinessRatio: number;
  status: 'ready' | 'attention' | 'blocked';
}

export interface BatchProgressSummary {
  failureCount: number;
  processedCount: number;
  successCount: number;
  successRatio: number;
}

export const parseKeywordLines = (keywords: string): string[] => {
  return keywords
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

export const getRoleCounts = (
  accounts: AccountData[],
  accountRoles: Map<string, AccountRole>
): RoleCounts => {
  const writerCount = accounts.filter((account) => {
    const role = accountRoles.get(account.id) || 'both';

    return role === 'both' || role === 'writer';
  }).length;
  const commenterCount = accounts.filter((account) => {
    const role = accountRoles.get(account.id) || 'both';

    return role === 'both' || role === 'commenter';
  }).length;
  const activeCount = accounts.filter((account) => {
    return (accountRoles.get(account.id) || 'both') !== 'disabled';
  }).length;

  return {
    activeCount,
    writerCount,
    commenterCount,
  };
};

export const getModelLabel = (
  model: string,
  models: Array<{ value: string; label: string }>
): string => {
  return models.find((option) => option.value === model)?.label || '기본 모델';
};

export const getImageSummary = (
  enableImage: boolean,
  imageSource: 'ai' | 'search',
  imageCount: number
): string => {
  if (!enableImage) {
    return '사용 안함';
  }

  const sourceLabel = imageSource === 'ai' ? 'AI 생성' : '구글 검색';

  if (imageCount === 0) {
    return `${sourceLabel} · 랜덤 1~2장`;
  }

  return `${sourceLabel} · ${imageCount}장`;
};

export const getCompletionMetrics = (
  partialResults: ViralPartialResult[],
  totalKeywords: number
): CompletionMetrics => {
  const processedCount = Math.min(partialResults.length, totalKeywords);
  const successCount = partialResults.filter(({ success }) => success).length;
  const failureCount = partialResults.length - successCount;
  const pendingCount = Math.max(totalKeywords - processedCount, 0);
  const progressPercent = totalKeywords === 0 ? 0 : Math.round((processedCount / totalKeywords) * 100);

  return {
    processedCount,
    successCount,
    failureCount,
    pendingCount,
    progressPercent,
  };
};

export const getRunReadiness = ({
  commenterCount,
  isPending,
  keywordCount,
  selectedCafeCount,
  writerCount,
}: RunReadinessInput): RunReadiness => {
  if (isPending) {
    return {
      tone: 'running',
      label: '실행 중',
      description: '현재 배치가 진행 중입니다. 라이브 로그와 결과 보드를 확인하세요.',
    };
  }

  if (keywordCount === 0) {
    return {
      tone: 'attention',
      label: '키워드 필요',
      description: '직접 입력하거나 AI 생성으로 실행 대상을 먼저 채워야 합니다.',
    };
  }

  if (selectedCafeCount === 0) {
    return {
      tone: 'attention',
      label: '카페 선택 필요',
      description: '발행 대상 카페를 선택해야 실행 구성이 완성됩니다.',
    };
  }

  if (writerCount === 0 || commenterCount === 0) {
    return {
      tone: 'attention',
      label: '계정 배치 필요',
      description: '글 작성과 댓글 작성 계정이 모두 배정되어야 안정적으로 실행됩니다.',
    };
  }

  return {
    tone: 'ready',
    label: '실행 준비 완료',
    description: '입력, 대상, 계정 구성이 준비되었습니다. 실행 후 로그에서 바로 확인할 수 있습니다.',
  };
};

export const getExecutionReadiness = ({
  activeCount,
  commenterCount,
  keywordCount,
  selectedCafeCount,
  writerCount,
}: ExecutionReadinessInput): ExecutionReadiness => {
  const checks: ExecutionReadinessCheck[] = [
    {
      description: '실행 대상 키워드 확보',
      label: '키워드',
      ok: keywordCount > 0,
      required: true,
      value: `${keywordCount}개`,
    },
    {
      description: '배포할 카페 지정',
      label: '카페',
      ok: selectedCafeCount > 0,
      required: true,
      value: `${selectedCafeCount}개`,
    },
    {
      description: '본문 작성 계정 배정',
      label: '글 계정',
      ok: writerCount > 0,
      required: true,
      value: `${writerCount}개`,
    },
    {
      description: '댓글 흐름 계정 배정',
      label: '댓글 계정',
      ok: commenterCount > 0,
      required: true,
      value: `${commenterCount}개`,
    },
    {
      description: '운영 여유 계정 확보',
      label: '운영 여유',
      ok: activeCount >= 2,
      required: false,
      value: `${activeCount}개`,
    },
  ];

  const readyCount = checks.filter(({ ok }) => ok).length;
  const blockers = checks
    .filter(({ ok, required }) => !ok && required)
    .map(({ description }) => description);
  const cautions = checks
    .filter(({ ok, required }) => !ok && !required)
    .map(({ description }) => description);

  if (blockers.length > 0) {
    return {
      blockers,
      cautions,
      checks,
      description: `${blockers.length}개 필수 조건을 채워야 실행 가능.`,
      headline: '준비 필요',
      readinessRatio: readyCount / checks.length,
      status: 'blocked',
    };
  }

  if (cautions.length > 0) {
    return {
      blockers,
      cautions,
      checks,
      description: `${cautions.length}개 운영 리스크를 확인 후 실행 권장.`,
      headline: '주의 필요',
      readinessRatio: readyCount / checks.length,
      status: 'attention',
    };
  }

  return {
    blockers,
    cautions,
    checks,
    description: '필수 조건이 모두 채워졌습니다. 바로 실행 가능.',
    headline: '실행 가능',
    readinessRatio: readyCount / checks.length,
    status: 'ready',
  };
};

export const getBatchProgress = (partialResults: ViralPartialResult[]): BatchProgressSummary => {
  const successCount = partialResults.filter(({ success }) => success).length;
  const failureCount = partialResults.length - successCount;

  return {
    failureCount,
    processedCount: partialResults.length,
    successCount,
    successRatio: partialResults.length === 0 ? 0 : successCount / partialResults.length,
  };
};
