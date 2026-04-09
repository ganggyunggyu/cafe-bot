'use client';

import { useEffect, useState, useTransition } from 'react';
import { useAtom } from 'jotai';
import { cn } from '@/shared/lib/cn';
import { Button, Checkbox, ExecuteConfirmModal, Select, type SettingItem } from '@/shared/ui';
import { toast } from '@/shared/lib/toast';
import { PostOptionsUI } from '@/features/auto-comment/batch/post-options-ui';
import { cafesAtom, cafesInitializedAtom, postOptionsAtom } from '@/entities/store';
import { getAccountsAction, getCafesAction, type AccountData } from '@/features/accounts/actions';
import { getDelaySettings } from '@/shared/hooks/use-delay-settings';
import { generateKeywords } from '@/shared/api/keyword-gen-api';
import { userAtom } from '@/shared/store';
import { getKeywordPromptProfileForLoginId } from '@/shared/config/user-profile';
import {
  getImageSummary,
  getModelLabel,
  getRoleCounts,
  getRunReadiness,
  parseKeywordLines,
  type AccountRole,
  type ViralPartialResult,
} from './viral-batch-ui.helpers';
import type { ViralBatchResult } from './viral-batch-job';
import { ViralBatchSummaryCard } from './ui/viral-batch-summary-card';
import { ViralBatchStatusPanel } from './ui/viral-batch-status-panel';

interface ViralPreset {
  name: string;
  cafeIds: string[];
  model: string;
  enableImage: boolean;
  imageSource: 'ai' | 'search';
  imageCount: number;
  accountRoles: Record<string, AccountRole>;
}

const PRESET_STORAGE_KEY = 'viral-batch-presets';

const MODELS = [
  { value: '', label: '기본 (Gemini 3.1 Pro)' },
  { value: 'gpt-5.2-2025-12-11', label: 'GPT 5.2' },
  { value: 'gpt-5.1-2025-11-13', label: 'GPT 5.1' },
  { value: 'gpt-5-2025-08-07', label: 'GPT 5' },
  { value: 'gpt-5-mini-2025-08-07', label: 'GPT 5 Mini' },
  { value: 'chatgpt-4o-latest', label: 'ChatGPT 4o' },
  { value: 'gpt-4o', label: 'GPT-4o API' },
  { value: 'gpt-4.1-2025-04-14', label: 'GPT 4.1' },
  { value: 'gpt-4.1-mini-2025-04-14', label: 'GPT 4.1 Mini' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
  { value: 'solar-pro', label: 'Solar Pro (한국어)' },
  { value: 'solar-pro2', label: 'Solar Pro 2 (한국어)' },
  { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1' },
  { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 추론' },
  { value: 'grok-4-fast-non-reasoning', label: 'Grok 4' },
  { value: 'grok-4-fast-reasoning', label: 'Grok 4 추론' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
];

const loadPresets = (): ViralPreset[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const data = localStorage.getItem(PRESET_STORAGE_KEY);

    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const savePresets = (presets: ViralPreset[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
};

const IMAGE_COUNT_OPTIONS = [
  { value: '0', label: '랜덤 1~2장' },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => ({
    value: String(count),
    label: `${count}장`,
  })),
];

export const ViralBatchUI = () => {
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [keywords, setKeywords] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [cafes, setCafes] = useAtom(cafesAtom);
  const [cafesInitialized, setCafesInitialized] = useAtom(cafesInitializedAtom);
  const [selectedCafeIds, setSelectedCafeIds] = useState<string[]>([]);
  const [postOptions, setPostOptions] = useAtom(postOptionsAtom);
  const [result, setResult] = useState<ViralBatchResult | null>(null);
  const [user] = useAtom(userAtom);
  const [enableImage, setEnableImage] = useState(false);
  const [imageSource, setImageSource] = useState<'ai' | 'search'>('search');
  const [imageCount, setImageCount] = useState(0);
  const [partialResults, setPartialResults] = useState<ViralPartialResult[]>([]);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [showAccountRoles, setShowAccountRoles] = useState(false);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [accountRoles, setAccountRoles] = useState<Map<string, AccountRole>>(new Map());
  const [presets, setPresets] = useState<ViralPreset[]>([]);
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [genCount, setGenCount] = useState(30);
  const [genShuffle, setGenShuffle] = useState(true);
  const [genNote, setGenNote] = useState('');

  const inputClassName = cn(
    'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink',
    'placeholder:text-ink-tertiary transition-all',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10'
  );
  const sectionClassName = cn(
    'overflow-hidden rounded-[28px] border border-border-light bg-[linear-gradient(180deg,var(--surface),color-mix(in_srgb,var(--surface-muted)_60%,var(--surface)))] shadow-sm'
  );
  const sectionHeadingClassName = cn('text-xl font-semibold tracking-tight text-ink');
  const labelClassName = cn('text-sm font-medium text-ink');
  const helperTextClassName = cn('text-sm leading-6 text-ink-muted');

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    if (cafesInitialized) {
      return;
    }

    const loadCafes = async () => {
      const cafeData = await getCafesAction();
      const defaultCafe = cafeData.find(({ isDefault }) => isDefault) || cafeData[0];

      setCafes(cafeData);

      if (defaultCafe) {
        setSelectedCafeIds([defaultCafe.cafeId]);
      }

      setCafesInitialized(true);
    };

    loadCafes();
  }, [cafesInitialized, setCafes, setCafesInitialized]);

  useEffect(() => {
    const loadAccounts = async () => {
      const accountData = await getAccountsAction();
      const nextRoles = new Map<string, AccountRole>();

      accountData.forEach(({ id }) => nextRoles.set(id, 'both'));

      setAccounts(accountData);
      setAccountRoles(nextRoles);
    };

    loadAccounts();
  }, []);

  const selectedCafes = cafes.filter(({ cafeId }) => selectedCafeIds.includes(cafeId));
  const selectedCafeNames = selectedCafes.map(({ name }) => name);
  const categories = [...new Set(selectedCafes.flatMap(({ categories: cafeCategories }) => cafeCategories))];
  const parsedKeywords = parseKeywordLines(keywords);
  const keywordCount = parsedKeywords.length;
  const { activeCount, commenterCount, writerCount } = getRoleCounts(accounts, accountRoles);
  const writerAccountIds = accounts
    .filter(({ id }) => ['both', 'writer'].includes(accountRoles.get(id) || 'both'))
    .map(({ id }) => id);
  const commenterAccountIds = accounts
    .filter(({ id }) => ['both', 'commenter'].includes(accountRoles.get(id) || 'both'))
    .map(({ id }) => id);
  const modelLabel = getModelLabel(model, MODELS);
  const imageSummary = getImageSummary(enableImage, imageSource, imageCount);
  const readinessItems = [
    {
      label: '키워드 큐',
      ready: keywordCount > 0,
      detail: keywordCount > 0 ? `${keywordCount}개 준비됨` : '1개 이상 필요',
    },
    {
      label: '카페 연결',
      ready: selectedCafeIds.length > 0,
      detail: selectedCafeIds.length > 0 ? `${selectedCafeIds.length}개 선택` : '카페 선택 필요',
    },
    {
      label: '글 계정',
      ready: writerCount > 0,
      detail: writerCount > 0 ? `${writerCount}개 활성` : '글 계정 필요',
    },
    {
      label: '댓글 계정',
      ready: commenterCount > 0,
      detail: commenterCount > 0 ? `${commenterCount}개 활성` : '댓글 계정 필요',
    },
  ];
  const blockers = readinessItems
    .filter(({ ready }) => !ready)
    .map(({ label, detail }) => `${label}: ${detail}`);
  const readinessCount = readinessItems.filter(({ ready }) => ready).length;
  const readinessTotal = readinessItems.length;
  const canRunBatch = blockers.length === 0;
  const runReadiness = getRunReadiness({
    commenterCount,
    isPending,
    keywordCount,
    selectedCafeCount: selectedCafeIds.length,
    writerCount,
  });
  const modalSettings: SettingItem[] = [
    { label: '키워드', value: `${keywordCount}개`, highlight: true },
    {
      label: '카페',
      value: selectedCafeIds.length > 0 ? `${selectedCafeIds.length}개 (${selectedCafeNames.join(', ')})` : '선택 안됨',
    },
    { label: 'AI 모델', value: modelLabel },
    { label: '이미지', value: imageSummary },
    { label: '글 작성 계정', value: `${writerCount}개` },
    { label: '댓글 작성 계정', value: `${commenterCount}개` },
  ];

  const handleSavePreset = () => {
    const presetName = newPresetName.trim();

    if (!presetName) {
      toast.warning('프리셋 이름을 입력해주세요');

      return;
    }

    const nextPreset: ViralPreset = {
      name: presetName,
      cafeIds: selectedCafeIds,
      model,
      enableImage,
      imageSource,
      imageCount,
      accountRoles: Object.fromEntries(accountRoles),
    };
    const nextPresets = [...presets.filter(({ name }) => name !== nextPreset.name), nextPreset];

    setPresets(nextPresets);
    savePresets(nextPresets);
    setNewPresetName('');
    toast.success(`프리셋 "${nextPreset.name}" 저장됨`);
  };

  const handleLoadPreset = (preset: ViralPreset) => {
    setSelectedCafeIds(preset.cafeIds);
    setModel(preset.model);
    setEnableImage(preset.enableImage);
    setImageSource(preset.imageSource);
    setImageCount(preset.imageCount);
    setAccountRoles(new Map(Object.entries(preset.accountRoles) as [string, AccountRole][]));
    setShowPresetPanel(false);
    toast.success(`프리셋 "${preset.name}" 불러옴`);
  };

  const handleDeletePreset = (presetName: string) => {
    const nextPresets = presets.filter(({ name }) => name !== presetName);

    setPresets(nextPresets);
    savePresets(nextPresets);
    toast.success(`프리셋 "${presetName}" 삭제됨`);
  };

  const handleGenerateKeywords = () => {
    if (selectedCafeIds.length === 0) {
      toast.warning('카페를 먼저 선택해주세요');

      return;
    }

    startGenerating(async () => {
      const loadingId = toast.loading('키워드 생성 중...');

      try {
        const promptProfile = getKeywordPromptProfileForLoginId(user?.loginId);
        const countPerCafe = Math.ceil(genCount / selectedCafes.length);
        const allKeywords: { keyword: string; category: string }[] = [];

        for (const cafe of selectedCafes) {
          if (cafe.categories.length === 0) {
            continue;
          }

          toast.loading(`${cafe.name} 키워드 생성 중...`, { id: loadingId });

          const response = await generateKeywords({
            categories: cafe.categories,
            count: countPerCafe,
            shuffle: genShuffle,
            note: genNote.trim() || undefined,
            prompt_profile: promptProfile,
          });

          allKeywords.push(...response.keywords);
        }

        if (genShuffle) {
          for (let index = allKeywords.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [allKeywords[index], allKeywords[swapIndex]] = [allKeywords[swapIndex], allKeywords[index]];
          }
        }

        setKeywords(allKeywords.map(({ keyword, category }) => `${keyword}:${category}`).join('\n'));
        setShowGenerator(false);
        toast.dismiss(loadingId);
        toast.success(`${allKeywords.length}개 키워드 생성 완료 (${selectedCafes.length}개 카페)`);
      } catch (error) {
        toast.dismiss(loadingId);
        toast.error('키워드 생성 실패', error instanceof Error ? error.message : undefined);
      }
    });
  };

  const handleRunClick = () => {
    if (parsedKeywords.length === 0) {
      toast.warning('키워드를 입력해주세요');

      return;
    }

    if (selectedCafeIds.length === 0) {
      toast.warning('카페를 먼저 선택해주세요');

      return;
    }

    if (writerCount === 0) {
      toast.warning('글 작성 계정을 1개 이상 활성화해주세요');

      return;
    }

    if (commenterCount === 0) {
      toast.warning('댓글 작성 계정을 1개 이상 활성화해주세요');

      return;
    }

    setShowExecuteModal(true);
  };

  const handleRun = () => {
    const delaySettings = getDelaySettings();

    setShowExecuteModal(false);

    startTransition(async () => {
      setResult(null);
      setPartialResults([]);
      const loadingId = toast.loading(`0/${parsedKeywords.length} 처리 중...`);

      try {
        const response = await fetch('/api/viral/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords: parsedKeywords,
            cafeIds: selectedCafeIds,
            postOptions,
            model: model || undefined,
            enableImage,
            imageSource: enableImage ? imageSource : undefined,
            imageCount: enableImage ? imageCount : 0,
            delays: delaySettings.delays,
            writerAccountIds,
            commenterAccountIds,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error('스트림 연결 실패');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }

            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              const current = data.keywordIndex + 1;
              const total = data.totalKeywords;

              toast.loading(`${current}/${total} 처리 중... (${data.currentKeyword})`, { id: loadingId });

              if (data.phase === 'done') {
                setPartialResults((previous) => [
                  ...previous,
                  {
                    keyword: data.currentKeyword,
                    success: data.success ?? false,
                    title: data.title,
                    error: data.error,
                  },
                ]);
              }
            } else if (data.type === 'complete') {
              const nextResult = data.result as ViralBatchResult;

              setResult(nextResult);
              toast.dismiss(loadingId);

              if (nextResult.success) {
                toast.success(`${nextResult.completed}/${nextResult.totalKeywords} 완료`);
              } else {
                toast.warning(`${nextResult.completed}/${nextResult.totalKeywords} 완료 (일부 실패)`);
              }
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      } catch (error) {
        toast.dismiss(loadingId);
        toast.error('배치 실행 실패', error instanceof Error ? error.message : undefined);
        setResult({
          success: false,
          totalKeywords: parsedKeywords.length,
          completed: 0,
          failed: parsedKeywords.length,
          results: parsedKeywords.map((keyword) => ({
            keyword,
            keywordType: 'own',
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류',
          })),
        });
      }
    });
  };

  const handleToggleGenerator = () => {
    setShowGenerator((previous) => !previous);
  };

  const handleTogglePresetPanel = () => {
    setShowPresetPanel((previous) => !previous);
  };

  const handleToggleAccountRoles = () => {
    setShowAccountRoles((previous) => !previous);
  };

  const handleSelectAllCafes = () => {
    setSelectedCafeIds(cafes.map(({ cafeId }) => cafeId));
  };

  const handleClearCafes = () => {
    setSelectedCafeIds([]);
  };

  const handleSetAllRoles = (role: AccountRole) => {
    const nextRoles = new Map<string, AccountRole>();

    accounts.forEach(({ id }) => nextRoles.set(id, role));
    setAccountRoles(nextRoles);
  };

  return (
    <div className={cn('space-y-8')}>
      <section
        className={cn(
          'overflow-hidden rounded-[32px] border border-border-light',
          'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface)_90%,var(--info-soft)_10%),color-mix(in_srgb,var(--surface)_92%,var(--surface-muted)_8%))] shadow-sm'
        )}
      >
        <div className={cn('grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:px-7 xl:py-7')}>
          <div>
            <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Batch Command Deck</p>
            <h2 className={cn('mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-[2rem]')}>
              {runReadiness.label}
            </h2>
            <p className={cn('mt-3 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base')}>
              {runReadiness.description}
            </p>

            <div className={cn('mt-5 flex flex-wrap gap-2')}>
              <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1.5 text-sm text-ink')}>
                카페 {selectedCafeIds.length}개
              </span>
              <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1.5 text-sm text-ink')}>
                카테고리 {categories.length}개
              </span>
              <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1.5 text-sm text-ink')}>
                계정 {activeCount}개 활성
              </span>
              <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1.5 text-sm text-ink')}>
                이미지 {imageSummary}
              </span>
              <span
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium',
                  canRunBatch ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                )}
              >
                {canRunBatch ? 'Launch Ready' : 'Setup Check'}
              </span>
            </div>

            <div className={cn('mt-6 flex flex-wrap gap-3')}>
              <Button size="lg" onClick={handleRunClick} disabled={!canRunBatch} isLoading={isPending}>
                {isPending ? '배치 실행 중' : '지금 실행'}
              </Button>
              <Button variant={showGenerator ? 'primary' : 'secondary'} size="lg" onClick={handleToggleGenerator}>
                {showGenerator ? 'AI 생성 닫기' : 'AI 키워드 생성'}
              </Button>
              <Button variant="secondary" size="lg" onClick={handleTogglePresetPanel}>
                프리셋 {showPresetPanel ? '숨기기' : '열기'}
              </Button>
            </div>
          </div>

          <div className={cn('rounded-[28px] border border-border-light bg-surface/90 px-5 py-5')}>
            <div className={cn('flex items-start justify-between gap-4')}>
              <div>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>준비 상태</p>
                <p className={cn('mt-2 text-3xl font-semibold tracking-tight text-ink')}>
                  {readinessCount}
                  <span className={cn('ml-1 text-lg text-ink-tertiary')}>/ {readinessTotal}</span>
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  canRunBatch ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                )}
              >
                {canRunBatch ? '즉시 실행 가능' : '사전 조건 확인'}
              </span>
            </div>

            <div className={cn('mt-5 space-y-3')}>
              {readinessItems.map(({ detail, label, ready }) => (
                <div key={label} className={cn('rounded-[20px] bg-surface-muted px-4 py-3')}>
                  <div className={cn('flex items-center justify-between gap-3')}>
                    <div className={cn('flex items-center gap-3')}>
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          ready ? 'bg-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_18%,transparent)]' : 'bg-warning shadow-[0_0_0_4px_color-mix(in_srgb,var(--warning)_18%,transparent)]'
                        )}
                      />
                      <p className={cn('text-sm font-medium text-ink')}>{label}</p>
                    </div>
                    <p className={cn('text-xs text-ink-muted')}>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4')}>
        <div className={cn('rounded-[24px] border border-border-light bg-surface px-5 py-4 shadow-sm')}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>키워드 큐</p>
          <p className={cn('mt-2 text-2xl font-semibold tracking-tight text-ink')}>{keywordCount}개</p>
          <p className={cn('mt-1 text-sm text-ink-muted')}>실행 대상 줄 수 기준.</p>
        </div>
        <div className={cn('rounded-[24px] border border-border-light bg-surface px-5 py-4 shadow-sm')}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>선택 카페</p>
          <p className={cn('mt-2 text-2xl font-semibold tracking-tight text-ink')}>{selectedCafeIds.length}개</p>
          <p className={cn('mt-1 text-sm text-ink-muted')}>카테고리 {categories.length}개 연결.</p>
        </div>
        <div className={cn('rounded-[24px] border border-border-light bg-surface px-5 py-4 shadow-sm')}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>활성 계정</p>
          <p className={cn('mt-2 text-2xl font-semibold tracking-tight text-ink')}>{activeCount}개</p>
          <p className={cn('mt-1 text-sm text-ink-muted')}>글 {writerCount}개 / 댓글 {commenterCount}개.</p>
        </div>
        <div className={cn('rounded-[24px] border border-border-light bg-surface px-5 py-4 shadow-sm')}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>모델 / 이미지</p>
          <p className={cn('mt-2 text-lg font-semibold tracking-tight text-ink')}>{modelLabel}</p>
          <p className={cn('mt-1 text-sm text-ink-muted')}>{imageSummary}</p>
        </div>
      </div>

      <div className={cn('grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]')}>
        <div className={cn('space-y-6')}>
          <section className={sectionClassName}>
            <div className={cn('border-b border-border-light px-6 py-5')}>
              <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between')}>
                <div>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Step 1</p>
                  <h3 className={cn('mt-2', sectionHeadingClassName)}>키워드 작업대</h3>
                  <p className={cn('mt-2', helperTextClassName)}>
                    직접 입력과 AI 생성을 한 흐름에서 정리할 수 있게 구성.
                  </p>
                </div>
                <div className={cn('flex flex-wrap gap-2')}>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    직접 입력
                  </span>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    AI 생성
                  </span>
                  <span className={cn('rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs font-medium text-accent')}>
                    {keywordCount}개 준비
                  </span>
                </div>
              </div>
            </div>

            <div className={cn('grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_280px]')}>
              <div className={cn('space-y-5')}>
                <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
                  <div>
                    <label className={labelClassName}>키워드 목록</label>
                    <p className={cn('mt-1 text-sm text-ink-muted')}>
                      한 줄에 하나씩 입력하고, 필요하면 `키워드:카테고리:스타일` 형식으로 확장.
                    </p>
                  </div>
                  <div className={cn('flex items-center gap-2')}>
                    {keywordCount > 0 && (
                      <span className={cn('rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent')}>
                        {keywordCount}개 준비됨
                      </span>
                    )}
                    <Button
                      variant={showGenerator ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={handleToggleGenerator}
                    >
                      {showGenerator ? 'AI 생성 닫기' : 'AI로 생성'}
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    showGenerator ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className={cn('overflow-hidden')}>
                    <div className={cn('rounded-[24px] border border-info/20 bg-info-soft p-5')}>
                      <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between')}>
                        <div>
                          <p className={cn('text-sm font-semibold text-info')}>AI 키워드 생성</p>
                          <p className={cn('mt-1 text-sm text-info/80')}>
                            {categories.length > 0 ? `${categories.join(', ')} 기반으로 생성.` : '카페를 먼저 선택하면 카테고리 기반 생성 가능.'}
                          </p>
                        </div>
                        <span className={cn('rounded-full bg-info/10 px-3 py-1 text-xs font-medium text-info')}>
                          {selectedCafeIds.length}개 카페 선택
                        </span>
                      </div>

                      <div className={cn('mt-5 grid gap-4 lg:grid-cols-[180px_1fr]')}>
                        <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-1')}>
                          <div className={cn('space-y-1.5')}>
                            <label className={cn('text-xs font-medium text-ink-muted')}>개수</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={genCount}
                              onFocus={(event) => event.target.select()}
                              onChange={(event) => {
                                const cleaned = event.target.value.replace(/\D/g, '');

                                if (cleaned === '') {
                                  return;
                                }

                                setGenCount(Math.max(1, Math.min(200, Number(cleaned))));
                              }}
                              className={cn(inputClassName, 'py-2 text-center')}
                            />
                          </div>
                          <div className={cn('flex items-end')}>
                            <Checkbox
                              size="sm"
                              label="결과 섞기"
                              checked={genShuffle}
                              onChange={(event) => setGenShuffle(event.target.checked)}
                            />
                          </div>
                        </div>

                        <div className={cn('space-y-4')}>
                          <div className={cn('space-y-1.5')}>
                            <label className={cn('text-xs font-medium text-ink-muted')}>추가 요청</label>
                            <input
                              type="text"
                              value={genNote}
                              onChange={(event) => setGenNote(event.target.value)}
                              placeholder="예: 초보자 톤, 계절성 강조, 후기 중심..."
                              className={cn(inputClassName, 'py-2')}
                            />
                          </div>
                          <Button
                            onClick={handleGenerateKeywords}
                            disabled={categories.length === 0}
                            isLoading={isGenerating}
                          >
                            {`${genCount}개 생성하기`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <textarea
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder={`키워드 또는 키워드:카테고리:스타일 (한 줄에 하나씩)

스타일: 자사키워드(광고, 기본값) | 일상 | 애니

예:
기력보충
수족냉증:건강
수족냉증:건강:자사키워드
기력보충:자사키워드
흐염소진액 효과:후기`}
                  className={cn(inputClassName, 'min-h-72 resize-y font-mono text-xs leading-6')}
                />

                <div className={cn('rounded-[20px] border border-border-light bg-surface px-4 py-4')}>
                  <p className={cn('text-sm font-semibold text-ink')}>스타일 빠른 참고</p>
                  <div className={cn('mt-3 grid gap-3 md:grid-cols-3')}>
                    <div className={cn('rounded-2xl bg-surface-muted px-4 py-3')}>
                      <p className={cn('text-sm font-medium text-ink')}>자사키워드</p>
                      <p className={cn('mt-1 text-sm text-ink-muted')}>300~500자 고민글 뒤에 댓글 흐름으로 연결.</p>
                    </div>
                    <div className={cn('rounded-2xl bg-surface-muted px-4 py-3')}>
                      <p className={cn('text-sm font-medium text-ink')}>일상</p>
                      <p className={cn('mt-1 text-sm text-ink-muted')}>짧은 톤의 카페 활동용 문구에 적합.</p>
                    </div>
                    <div className={cn('rounded-2xl bg-surface-muted px-4 py-3')}>
                      <p className={cn('text-sm font-medium text-ink')}>애니</p>
                      <p className={cn('mt-1 text-sm text-ink-muted')}>캐릭터성이 강한 변주가 필요할 때 사용.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className={cn('space-y-4')}>
                <div className={cn('rounded-[24px] border border-border-light bg-surface px-5 py-5')}>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>Input Brief</p>
                  <h4 className={cn('mt-3 text-lg font-semibold text-ink')}>현재 입력 컨텍스트</h4>
                  <div className={cn('mt-4 space-y-3')}>
                    <div className={cn('rounded-2xl bg-surface-muted px-4 py-3')}>
                      <p className={cn('text-xs text-ink-tertiary')}>선택 카페</p>
                      <p className={cn('mt-1 text-sm text-ink')}>{selectedCafeNames.length > 0 ? selectedCafeNames.join(', ') : '선택 안됨'}</p>
                    </div>
                    <div className={cn('rounded-2xl bg-surface-muted px-4 py-3')}>
                      <p className={cn('text-xs text-ink-tertiary')}>카테고리</p>
                      <p className={cn('mt-1 text-sm text-ink')}>{categories.length > 0 ? categories.join(', ') : '연결된 카테고리 없음'}</p>
                    </div>
                    <div className={cn('rounded-2xl bg-surface-muted px-4 py-3')}>
                      <p className={cn('text-xs text-ink-tertiary')}>입력 방식</p>
                      <p className={cn('mt-1 text-sm text-ink')}>
                        {showGenerator ? '직접 입력 + AI 생성 병행' : '직접 입력 중심'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={cn('rounded-[24px] border border-border-light bg-surface px-5 py-5')}>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>Keyword Preview</p>
                  <h4 className={cn('mt-3 text-lg font-semibold text-ink')}>최근 입력 미리보기</h4>
                  <div className={cn('mt-4 space-y-2')}>
                    {parsedKeywords.length > 0 ? (
                      parsedKeywords.slice(0, 5).map((keyword) => (
                        <div key={keyword} className={cn('rounded-2xl border border-border-light bg-surface-muted px-4 py-3 text-sm text-ink')}>
                          {keyword}
                        </div>
                      ))
                    ) : (
                      <div className={cn('rounded-2xl border border-dashed border-border bg-surface-muted px-4 py-6 text-sm text-ink-muted')}>
                        입력된 키워드가 아직 없음
                      </div>
                    )}
                  </div>
                  {parsedKeywords.length > 5 && (
                    <p className={cn('mt-3 text-xs text-ink-muted')}>외 {parsedKeywords.length - 5}개</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className={sectionClassName}>
            <div className={cn('border-b border-border-light px-6 py-5')}>
              <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between')}>
                <div>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Step 2</p>
                  <h3 className={cn('mt-2', sectionHeadingClassName)}>프리셋 보관함</h3>
                  <p className={cn('mt-2', helperTextClassName)}>
                    자주 쓰는 카페 조합과 모델 선택을 저장하고 바로 복원 가능.
                  </p>
                </div>
                <div className={cn('flex flex-wrap gap-2')}>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    저장 {presets.length}개
                  </span>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    빠른 복원
                  </span>
                </div>
              </div>
            </div>

            <div className={cn('space-y-4 px-6 py-6')}>
              <button
                type="button"
                onClick={handleTogglePresetPanel}
                className={cn('flex w-full items-center justify-between rounded-2xl border border-border-light bg-surface px-4 py-3 text-left')}
              >
                <div>
                  <p className={cn('text-sm font-semibold text-ink')}>저장된 프리셋</p>
                  <p className={cn('mt-1 text-sm text-ink-muted')}>{presets.length}개 저장됨</p>
                </div>
                <span className={cn('text-sm text-ink-muted transition-transform', showPresetPanel && 'rotate-180')}>▼</span>
              </button>

              <div
                className={cn(
                  'grid transition-all duration-300 ease-out',
                  showPresetPanel ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                )}
              >
                <div className={cn('overflow-hidden')}>
                  <div className={cn('space-y-4')}>
                    {presets.length > 0 && (
                      <div className={cn('grid gap-3 md:grid-cols-2')}>
                        {presets.map((preset) => (
                          <div
                            key={preset.name}
                            className={cn('rounded-[24px] border border-border-light bg-surface px-4 py-4')}
                          >
                            <div className={cn('flex items-start justify-between gap-3')}>
                              <div className={cn('min-w-0')}>
                                <button
                                  type="button"
                                  onClick={() => handleLoadPreset(preset)}
                                  className={cn('truncate text-sm font-semibold text-ink hover:text-accent')}
                                >
                                  {preset.name}
                                </button>
                                <p className={cn('mt-2 text-sm text-ink-muted')}>
                                  {preset.cafeIds.length}개 카페 · {getModelLabel(preset.model, MODELS)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeletePreset(preset.name)}
                                className={cn('text-xs text-ink-muted hover:text-danger')}
                              >
                                삭제
                              </button>
                            </div>
                            <div className={cn('mt-3 flex flex-wrap gap-2')}>
                              <span className={cn('rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-ink')}>
                                이미지 {getImageSummary(preset.enableImage, preset.imageSource, preset.imageCount)}
                              </span>
                              <span className={cn('rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-ink')}>
                                계정 {Object.keys(preset.accountRoles).length}개
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={cn('flex flex-col gap-2 sm:flex-row')}>
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={(event) => setNewPresetName(event.target.value)}
                        placeholder="프리셋 이름"
                        className={cn(inputClassName, 'flex-1 py-2')}
                        onKeyDown={(event) => event.key === 'Enter' && handleSavePreset()}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSavePreset}
                        disabled={!newPresetName.trim()}
                      >
                        현재 설정 저장
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={sectionClassName}>
            <div className={cn('border-b border-border-light px-6 py-5')}>
              <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between')}>
                <div>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Step 3</p>
                  <h3 className={cn('mt-2', sectionHeadingClassName)}>실행 설정</h3>
                  <p className={cn('mt-2', helperTextClassName)}>
                    카페, 계정 역할, 모델, 이미지, 게시 옵션을 한 화면에서 순서대로 조정.
                  </p>
                </div>
                <div className={cn('flex flex-wrap gap-2')}>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    카페 {selectedCafeIds.length}개
                  </span>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    글 {writerCount}개
                  </span>
                  <span className={cn('rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-ink')}>
                    댓글 {commenterCount}개
                  </span>
                </div>
              </div>
            </div>

            <div className={cn('space-y-6 px-6 py-6')}>
              <div className={cn('space-y-3 rounded-[24px] border border-border-light bg-surface p-5')}>
                <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between')}>
                  <div>
                    <span className={labelClassName}>카페 선택</span>
                    <p className={cn('mt-1 text-sm text-ink-muted')}>
                      {selectedCafeIds.length}개 카페 선택됨
                    </p>
                  </div>
                  <div className={cn('flex items-center gap-3 text-sm')}>
                    <button type="button" onClick={handleSelectAllCafes} className={cn('text-accent hover:underline')}>
                      전체 선택
                    </button>
                    <button type="button" onClick={handleClearCafes} className={cn('text-ink-muted hover:underline')}>
                      선택 해제
                    </button>
                  </div>
                </div>

                <div className={cn('grid gap-2 md:grid-cols-2')}>
                  {cafes.map((cafe) => {
                    const isSelected = selectedCafeIds.includes(cafe.cafeId);
                    const handleToggleCafe = () => {
                      setSelectedCafeIds((previous) => (
                        isSelected
                          ? previous.filter((id) => id !== cafe.cafeId)
                          : [...previous, cafe.cafeId]
                      ));
                    };

                    return (
                      <button
                        key={cafe.cafeId}
                        type="button"
                        onClick={handleToggleCafe}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                          isSelected
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border-light bg-surface hover:border-border'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs',
                            isSelected ? 'border-accent bg-accent text-background' : 'border-border'
                          )}
                        >
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className={cn('min-w-0 flex-1 truncate text-sm font-medium text-ink')}>
                          {cafe.name}
                          {cafe.isDefault && <span className={cn('ml-2 text-xs text-accent/80')}>기본</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedCafes.length > 0 && (
                  <div className={cn('rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted')}>
                    카테고리: {categories.join(', ')}
                  </div>
                )}
              </div>

              <div className={cn('grid gap-6 lg:grid-cols-2')}>
                <div className={cn('space-y-4 rounded-[24px] border border-border-light bg-surface p-5')}>
                  <Select
                    label="AI 모델"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    options={MODELS}
                  />
                  <p className={cn('text-sm text-ink-muted')}>현재 선택: {modelLabel}</p>
                </div>

                <div className={cn('space-y-4 rounded-[24px] border border-border-light bg-surface p-5')}>
                  <Checkbox
                    label="이미지 첨부"
                    checked={enableImage}
                    onChange={(event) => setEnableImage(event.target.checked)}
                  />

                  {enableImage && (
                    <div className={cn('space-y-4')}>
                      <div className={cn('grid gap-2 sm:grid-cols-2')}>
                        <button
                          type="button"
                          onClick={() => setImageSource('search')}
                          className={cn(
                            'rounded-2xl border px-4 py-4 text-left transition-all',
                            imageSource === 'search'
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border-light bg-surface hover:border-border'
                          )}
                        >
                          <p className={cn('text-sm font-semibold')}>구글 검색</p>
                          <p className={cn('mt-1 text-sm text-ink-muted')}>랜덤 액자/필터 기반.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageSource('ai')}
                          className={cn(
                            'rounded-2xl border px-4 py-4 text-left transition-all',
                            imageSource === 'ai'
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border-light bg-surface hover:border-border'
                          )}
                        >
                          <p className={cn('text-sm font-semibold')}>AI 생성</p>
                          <p className={cn('mt-1 text-sm text-ink-muted')}>DALL-E / Imagen 기반.</p>
                        </button>
                      </div>

                      <Select
                        label="장수"
                        value={String(imageCount)}
                        onChange={(event) => setImageCount(Number(event.target.value))}
                        options={IMAGE_COUNT_OPTIONS}
                        fullWidth={false}
                        className="w-40"
                      />
                    </div>
                  )}

                  <p className={cn('text-sm text-ink-muted')}>현재 이미지 설정: {imageSummary}</p>
                </div>
              </div>

              {accounts.length > 0 && (
                <div className={cn('space-y-4 rounded-[24px] border border-border-light bg-surface p-5')}>
                  <button
                    type="button"
                    onClick={handleToggleAccountRoles}
                    className={cn('flex w-full items-center justify-between text-left')}
                  >
                    <div>
                      <span className={labelClassName}>계정 역할</span>
                      <p className={cn('mt-1 text-sm text-ink-muted')}>
                        글 {writerCount}개 / 댓글 {commenterCount}개
                      </p>
                    </div>
                    <span className={cn('text-sm text-ink-muted transition-transform', showAccountRoles && 'rotate-180')}>▼</span>
                  </button>

                  <div
                    className={cn(
                      'grid transition-all duration-300 ease-out',
                      showAccountRoles ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    )}
                  >
                    <div className={cn('overflow-hidden')}>
                      <div className={cn('space-y-4')}>
                        <div className={cn('flex flex-wrap gap-2')}>
                          <Button variant="secondary" size="xs" onClick={() => handleSetAllRoles('both')}>
                            전체 글/댓글
                          </Button>
                          <Button variant="secondary" size="xs" onClick={() => handleSetAllRoles('writer')}>
                            전체 글만
                          </Button>
                          <Button variant="secondary" size="xs" onClick={() => handleSetAllRoles('commenter')}>
                            전체 댓글만
                          </Button>
                          <Button variant="secondary" size="xs" onClick={() => handleSetAllRoles('disabled')}>
                            전체 비활성화
                          </Button>
                        </div>

                        <div className={cn('space-y-2')}>
                          {accounts.map((account) => {
                            const role = accountRoles.get(account.id) || 'both';
                            const canWrite = role === 'both' || role === 'writer';
                            const canComment = role === 'both' || role === 'commenter';

                            const handleToggleWrite = () => {
                              const nextRoles = new Map(accountRoles);

                              if (canWrite && canComment) {
                                nextRoles.set(account.id, 'commenter');
                              } else if (canWrite && !canComment) {
                                nextRoles.set(account.id, 'disabled');
                              } else if (!canWrite && canComment) {
                                nextRoles.set(account.id, 'both');
                              } else {
                                nextRoles.set(account.id, 'writer');
                              }

                              setAccountRoles(nextRoles);
                            };

                            const handleToggleComment = () => {
                              const nextRoles = new Map(accountRoles);

                              if (canWrite && canComment) {
                                nextRoles.set(account.id, 'writer');
                              } else if (!canWrite && canComment) {
                                nextRoles.set(account.id, 'disabled');
                              } else if (canWrite && !canComment) {
                                nextRoles.set(account.id, 'both');
                              } else {
                                nextRoles.set(account.id, 'commenter');
                              }

                              setAccountRoles(nextRoles);
                            };

                            return (
                              <div
                                key={account.id}
                                className={cn('grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-3 rounded-2xl bg-surface-muted px-4 py-3')}
                              >
                                <div className={cn('min-w-0')}>
                                  <p className={cn('truncate text-sm font-medium text-ink')}>
                                    {account.nickname || account.id}
                                  </p>
                                  <p className={cn('mt-1 text-xs text-ink-muted')}>
                                    {account.id}
                                    {account.isMain && <span className={cn('ml-2 text-accent')}>메인</span>}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleToggleWrite}
                                  className={cn(
                                    'mx-auto flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold transition-all',
                                    canWrite ? 'border-info bg-info text-background' : 'border-border hover:border-info/50'
                                  )}
                                >
                                  글
                                </button>
                                <button
                                  type="button"
                                  onClick={handleToggleComment}
                                  className={cn(
                                    'mx-auto flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold transition-all',
                                    canComment ? 'border-success bg-success text-background' : 'border-border hover:border-success/50'
                                  )}
                                >
                                  댓
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className={cn('space-y-3 rounded-[24px] border border-border-light bg-surface p-5')}>
                <span className={labelClassName}>게시 옵션</span>
                <div className={cn('rounded-[20px] border border-border-light bg-surface-muted p-4')}>
                  <PostOptionsUI options={postOptions} onChange={setPostOptions} />
                </div>
              </div>
            </div>
          </section>

          <section className={cn('rounded-[28px] border border-info/20 bg-info-soft px-6 py-6')}>
            <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between')}>
              <div>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Guide</p>
                <h3 className={cn('mt-2 text-xl font-semibold tracking-tight text-info')}>운영 기준 빠른 확인</h3>
              </div>
              <p className={cn('max-w-xl text-sm leading-6 text-info/80')}>
                실행 전에 흐름과 태그 규칙을 빠르게 다시 보는 용도. 작업대와 결과 영역을 같은 기준으로 해석 가능.
              </p>
            </div>

            <div className={cn('mt-5 grid gap-4 lg:grid-cols-3')}>
              <div className={cn('rounded-[20px] bg-info/10 px-4 py-4')}>
                <p className={cn('text-sm font-semibold text-info')}>키워드 자동 분류</p>
                <p className={cn('mt-2 text-sm leading-6 text-info/80')}>
                  자사는 직접 홍보 흐름, 타사는 질문형 비교 흐름으로 구성.
                </p>
              </div>
              <div className={cn('rounded-[20px] bg-info/10 px-4 py-4')}>
                <p className={cn('text-sm font-semibold text-info')}>댓글 태그 규칙</p>
                <p className={cn('mt-2 text-sm leading-6 text-info/80')}>
                  `[댓글N]`, `[작성자-N]`, `[댓글러-N]`, `[제3자-N]` 형식 유지.
                </p>
              </div>
              <div className={cn('rounded-[20px] bg-info/10 px-4 py-4')}>
                <p className={cn('text-sm font-semibold text-info')}>생성 구조</p>
                <p className={cn('mt-2 text-sm leading-6 text-info/80')}>
                  AI 1회 호출로 제목, 본문, 댓글, 대댓글까지 한 번에 생성.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className={cn('order-first xl:order-none')}>
          <ViralBatchSummaryCard
            activeCount={activeCount}
            blockers={blockers}
            canRun={canRunBatch}
            categoryCount={categories.length}
            commenterCount={commenterCount}
            imageSummary={imageSummary}
            isPending={isPending}
            keywordCount={keywordCount}
            modelLabel={modelLabel}
            onRunClick={handleRunClick}
            partialResults={partialResults}
            readinessCount={readinessCount}
            readinessTotal={readinessTotal}
            selectedCafeCount={selectedCafeIds.length}
            selectedCafeNames={selectedCafeNames}
            writerCount={writerCount}
          />
        </div>
      </div>

      <ViralBatchStatusPanel
        isPending={isPending}
        keywordCount={keywordCount}
        partialResults={partialResults}
        result={result}
      />

      <ExecuteConfirmModal
        isOpen={showExecuteModal}
        onClose={() => setShowExecuteModal(false)}
        onConfirm={handleRun}
        title="바이럴 배치를 실행하시겠습니까?"
        description="아래 설정으로 바이럴 콘텐츠가 생성됩니다."
        settings={modalSettings}
        confirmText="실행"
        isLoading={isPending}
      />
    </div>
  );
};
