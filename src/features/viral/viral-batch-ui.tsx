'use client';

import { useEffect, useState, useTransition } from 'react';
import { useAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { Select, Button, Checkbox, ExecuteConfirmModal, type SettingItem } from '@/shared/ui';
import { toast } from '@/shared/lib/toast';
import { PostOptionsUI } from '@/features/auto-comment/batch/post-options-ui';
import {
  postOptionsAtom,
  cafesAtom,
  cafesInitializedAtom,
} from '@/entities/store';
import { getCafesAction, getAccountsAction, type AccountData } from '@/features/accounts/actions';
import { getDelaySettings } from '@/shared/hooks/use-delay-settings';
import { generateKeywords } from '@/shared/api/keyword-gen-api';
import { userAtom } from '@/shared/store';
import { getKeywordPromptProfileForLoginId } from '@/shared/config/user-profile';
import type { ViralBatchResult } from './viral-batch-job';

type AccountRole = 'both' | 'writer' | 'commenter' | 'disabled';

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

const loadPresets = (): ViralPreset[] => {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(PRESET_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const savePresets = (presets: ViralPreset[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
};

const MODELS = [
  // 기본
  { value: '', label: '기본 (Gemini 3.1 Pro)' },
  // OpenAI
  { value: 'gpt-5.2-2025-12-11', label: 'GPT 5.2' },
  { value: 'gpt-5.1-2025-11-13', label: 'GPT 5.1' },
  { value: 'gpt-5-2025-08-07', label: 'GPT 5' },
  { value: 'gpt-5-mini-2025-08-07', label: 'GPT 5 Mini' },
  { value: 'chatgpt-4o-latest', label: 'ChatGPT 4o' },
  { value: 'gpt-4o', label: 'GPT-4o API' },
  { value: 'gpt-4.1-2025-04-14', label: 'GPT 4.1' },
  { value: 'gpt-4.1-mini-2025-04-14', label: 'GPT 4.1 Mini' },
  // Google
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  // Anthropic
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
  // Upstage
  { value: 'solar-pro', label: 'Solar Pro (한국어)' },
  { value: 'solar-pro2', label: 'Solar Pro 2 (한국어)' },
  // xAI
  { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1' },
  { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 추론' },
  { value: 'grok-4-fast-non-reasoning', label: 'Grok 4' },
  { value: 'grok-4-fast-reasoning', label: 'Grok 4 추론' },
  // DeepSeek
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
];

export const ViralBatchUI = () => {
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();
  const [keywords, setKeywords] = useState('');
  const [model, setModel] = useState('');
  const [cafes, setCafes] = useAtom(cafesAtom);
  const [cafesInitialized, setCafesInitialized] = useAtom(cafesInitializedAtom);
  const [selectedCafeIds, setSelectedCafeIds] = useState<string[]>([]);
  const [postOptions, setPostOptions] = useAtom(postOptionsAtom);
  const [result, setResult] = useState<ViralBatchResult | null>(null);
  const [user] = useAtom(userAtom);

  const [enableImage, setEnableImage] = useState(false);
  const [imageSource, setImageSource] = useState<'ai' | 'search'>('search');
  const [imageCount, setImageCount] = useState(0);

  // 실시간 진행 결과
  interface PartialResult {
    keyword: string;
    success: boolean;
    title?: string;
    error?: string;
  }
  const [partialResults, setPartialResults] = useState<PartialResult[]>([]);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [showAccountRoles, setShowAccountRoles] = useState(false);

  // 계정 역할 상태
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [accountRoles, setAccountRoles] = useState<Map<string, AccountRole>>(new Map());

  // 프리셋 상태
  const [presets, setPresets] = useState<ViralPreset[]>([]);
  const [showPresetPanel, setShowPresetPanel] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // 프리셋 로드 (클라이언트에서만)
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast.warning('프리셋 이름을 입력해주세요');
      return;
    }
    const newPreset: ViralPreset = {
      name: newPresetName.trim(),
      cafeIds: selectedCafeIds,
      model,
      enableImage,
      imageSource,
      imageCount,
      accountRoles: Object.fromEntries(accountRoles),
    };
    const updatedPresets = [...presets.filter((p) => p.name !== newPreset.name), newPreset];
    setPresets(updatedPresets);
    savePresets(updatedPresets);
    setNewPresetName('');
    toast.success(`프리셋 "${newPreset.name}" 저장됨`);
  };

  const handleLoadPreset = (preset: ViralPreset) => {
    setSelectedCafeIds(preset.cafeIds);
    setModel(preset.model);
    setEnableImage(preset.enableImage);
    setImageSource(preset.imageSource);
    setImageCount(preset.imageCount);
    setAccountRoles(new Map(Object.entries(preset.accountRoles) as [string, AccountRole][]));
    toast.success(`프리셋 "${preset.name}" 불러옴`);
    setShowPresetPanel(false);
  };

  const handleDeletePreset = (presetName: string) => {
    const updatedPresets = presets.filter((p) => p.name !== presetName);
    setPresets(updatedPresets);
    savePresets(updatedPresets);
    toast.success(`프리셋 "${presetName}" 삭제됨`);
  };

  // 키워드 생성 상태
  const [showGenerator, setShowGenerator] = useState(false);
  const [genCount, setGenCount] = useState(30);
  const [genShuffle, setGenShuffle] = useState(true);
  const [genNote, setGenNote] = useState('');

  const inputClassName = cn(
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink',
    'placeholder:text-ink-tertiary transition-all',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10'
  );

  const labelClassName = cn('text-sm font-medium text-ink');

  // 카페 초기화 (전역 상태)
  useEffect(() => {
    if (cafesInitialized) return;

    const loadCafes = async () => {
      const cafeData = await getCafesAction();
      setCafes(cafeData);
      const defaultCafe = cafeData.find((c) => c.isDefault) || cafeData[0];
      if (defaultCafe) {
        setSelectedCafeIds([defaultCafe.cafeId]);
      }
      setCafesInitialized(true);
    };
    loadCafes();
  }, [cafesInitialized, setCafes, setCafesInitialized]);

  // 계정 로딩 (로컬 상태 - 항상 실행)
  useEffect(() => {
    const loadAccounts = async () => {
      const accountData = await getAccountsAction();
      setAccounts(accountData);
      const roles = new Map<string, AccountRole>();
      accountData.forEach((a) => roles.set(a.id, 'both'));
      setAccountRoles(roles);
    };
    loadAccounts();
  }, []);

  // 선택된 카페들의 카테고리 합집합
  const selectedCafes = cafes.filter((c) => selectedCafeIds.includes(c.cafeId));
  const categories = [...new Set(selectedCafes.flatMap((c) => c.categories))];

  const handleGenerateKeywords = () => {
    if (selectedCafeIds.length === 0) {
      toast.warning('카페를 먼저 선택해주세요');
      return;
    }

    startGenerating(async () => {
      const loadingId = toast.loading('키워드 생성 중...');
      try {
        const promptProfile = getKeywordPromptProfileForLoginId(user?.loginId);
        // 카페별로 분리해서 키워드 생성
        const countPerCafe = Math.ceil(genCount / selectedCafes.length);
        const allKeywords: { keyword: string; category: string }[] = [];

        for (const cafe of selectedCafes) {
          if (cafe.categories.length === 0) continue;

          toast.loading(`${cafe.name} 키워드 생성 중...`, { id: loadingId });

          const res = await generateKeywords({
            categories: cafe.categories,
            count: countPerCafe,
            shuffle: genShuffle,
            note: genNote.trim() || undefined,
            prompt_profile: promptProfile,
          });

          allKeywords.push(...res.keywords);
        }

        // 섞기 옵션이면 전체 셔플
        if (genShuffle) {
          for (let i = allKeywords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allKeywords[i], allKeywords[j]] = [allKeywords[j], allKeywords[i]];
          }
        }

        const formatted = allKeywords.map((k) => `${k.keyword}:${k.category}`).join('\n');
        setKeywords(formatted);
        setShowGenerator(false);
        toast.dismiss(loadingId);
        toast.success(`${allKeywords.length}개 키워드 생성 완료 (${selectedCafes.length}개 카페)`);
      } catch (err) {
        toast.dismiss(loadingId);
        toast.error('키워드 생성 실패', err instanceof Error ? err.message : undefined);
      }
    });
  };

  const parseKeywords = (): string[] => {
    return keywords
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const handleRunClick = () => {
    const parsedKeywords = parseKeywords();
    if (parsedKeywords.length === 0) {
      toast.warning('키워드를 입력해주세요');
      return;
    }
    setShowExecuteModal(true);
  };

  const handleRun = () => {
    const parsedKeywords = parseKeywords();
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
            writerAccountIds: accounts
              .filter((a) => ['both', 'writer'].includes(accountRoles.get(a.id) || 'both'))
              .map((a) => a.id),
            commenterAccountIds: accounts
              .filter((a) => ['both', 'commenter'].includes(accountRoles.get(a.id) || 'both'))
              .map((a) => a.id),
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
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              const current = data.keywordIndex + 1;
              const total = data.totalKeywords;
              toast.loading(`${current}/${total} 처리 중... (${data.currentKeyword})`, { id: loadingId });

              // 키워드 처리 완료 시 실시간 결과 추가
              if (data.phase === 'done') {
                setPartialResults((prev) => [
                  ...prev,
                  {
                    keyword: data.currentKeyword,
                    success: data.success ?? false,
                    title: data.title,
                    error: data.error,
                  },
                ]);
              }
            } else if (data.type === 'complete') {
              const res = data.result as ViralBatchResult;
              setResult(res);
              toast.dismiss(loadingId);
              if (res.success) {
                toast.success(`${res.completed}/${res.totalKeywords} 완료`);
              } else {
                toast.warning(`${res.completed}/${res.totalKeywords} 완료 (일부 실패)`);
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
          results: parsedKeywords.map((k) => ({
            keyword: k,
            keywordType: 'own',
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류',
          })),
        });
      }
    });
  };

  const keywordCount = parseKeywords().length;

  return (
    <div className={cn('space-y-6')}>
      {/* 키워드 입력 영역 */}
      <div className={cn('space-y-4')}>
        <div className={cn('flex items-center justify-between')}>
          <label className={labelClassName}>키워드</label>
          <div className={cn('flex items-center gap-2')}>
            {keywordCount > 0 && (
              <span className={cn('text-sm font-medium text-accent')}>{keywordCount}개</span>
            )}
            <Button
              variant={showGenerator ? 'primary' : 'secondary'}
              size="xs"
              onClick={() => setShowGenerator(!showGenerator)}
            >
              {showGenerator ? 'AI 생성 닫기' : 'AI로 생성'}
            </Button>
          </div>
        </div>

        {/* AI 키워드 생성 패널 */}
        <div
          className={cn(
            'grid transition-all duration-300 ease-out',
            showGenerator ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className={cn('overflow-hidden')}>
            <div className={cn('rounded-xl border border-accent/30 bg-accent-soft p-4 space-y-4')}>
              <div className={cn('flex items-center gap-2')}>
                <span className={cn('text-sm font-semibold text-ink')}>AI 키워드 생성</span>
                <span className={cn('text-xs text-ink-muted')}>
                  {categories.length > 0 ? `${categories.join(', ')} 기반` : '카페를 먼저 선택하세요'}
                </span>
              </div>

              <div className={cn('grid grid-cols-2 gap-3')}>
                <div className={cn('space-y-1.5')}>
                  <label className={cn('text-xs font-medium text-ink-muted')}>개수</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={genCount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      if (cleaned === '') return;
                      setGenCount(Math.max(1, Math.min(200, Number(cleaned))));
                    }}
                    className={cn(inputClassName, 'py-2 text-center')}
                  />
                </div>
                <div className={cn('space-y-1.5 flex flex-col justify-end')}>
                  <Checkbox
                    size="sm"
                    label="섞기"
                    checked={genShuffle}
                    onChange={(e) => setGenShuffle(e.target.checked)}
                  />
                </div>
              </div>

              <div className={cn('space-y-1.5')}>
                <label className={cn('text-xs font-medium text-ink-muted')}>추가 요청 (선택)</label>
                <input
                  type="text"
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  placeholder="예: 봄철 관련, 초보자 타겟..."
                  className={cn(inputClassName, 'py-2')}
                />
              </div>

              <Button
                onClick={handleGenerateKeywords}
                disabled={categories.length === 0}
                isLoading={isGenerating}
                fullWidth
              >
                {`${genCount}개 생성하기`}
              </Button>
            </div>
          </div>
        </div>

        {/* 키워드 텍스트 영역 */}
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={`키워드 또는 키워드:카테고리:스타일 (한 줄에 하나씩)

스타일: 자사키워드(광고, 기본값) | 일상 | 애니

예:
기력보충            → 자사키워드(광고) 스타일 (기본)
수족냉증:건강       → 자사키워드(광고) 스타일 (기본)
수족냉증:건강:자사키워드  → 자사키워드(광고) 스타일
기력보충:자사키워드         → 자사키워드(광고) 스타일
흐염소진액 효과:후기`}
          className={cn(inputClassName, 'min-h-32 resize-none font-mono text-xs')}
        />
      </div>

      {/* 프리셋 패널 */}
      <div className={cn('rounded-2xl border border-border-light bg-surface p-4 space-y-3')}>
        <button
          type="button"
          onClick={() => setShowPresetPanel(!showPresetPanel)}
          className={cn('flex items-center justify-between w-full')}
        >
          <div className={cn('flex items-center gap-2')}>
            <span className={cn('text-sm font-semibold text-ink')}>프리셋</span>
            <span className={cn('text-xs text-ink-muted')}>
              {presets.length}개 저장됨
            </span>
          </div>
          <span className={cn('text-ink-muted text-sm transition-transform', showPresetPanel && 'rotate-180')}>
            ▼
          </span>
        </button>

        <div
          className={cn(
            'grid transition-all duration-300 ease-out',
            showPresetPanel ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className={cn('overflow-hidden')}>
            <div className={cn('space-y-3 pt-2')}>
              {/* 저장된 프리셋 목록 */}
              {presets.length > 0 && (
                <div className={cn('flex flex-wrap gap-2')}>
                  {presets.map((preset) => (
                    <div
                      key={preset.name}
                      className={cn(
                        'flex items-center gap-1 px-3 py-1.5 rounded-lg',
                        'bg-accent/10 border border-accent/30'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadPreset(preset)}
                        className={cn('text-sm font-medium text-accent hover:underline')}
                      >
                        {preset.name}
                      </button>
                      <span className={cn('text-xs text-ink-muted')}>
                        ({preset.cafeIds.length}카페)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.name)}
                        className={cn('text-ink-muted hover:text-danger ml-1')}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 새 프리셋 저장 */}
              <div className={cn('flex gap-2')}>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="프리셋 이름"
                  className={cn(inputClassName, 'py-2 flex-1')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
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

      {/* 설정 카드 */}
      <div className={cn('rounded-2xl border border-border-light bg-surface p-6 space-y-5')}>
        <h3 className={cn('text-base font-semibold text-ink')}>설정</h3>

        {/* 카페 선택 (다중) */}
        <div className={cn('space-y-3')}>
          <div className={cn('flex items-center justify-between')}>
            <span className={labelClassName}>카페 선택</span>
            <div className={cn('flex items-center gap-2')}>
              <span className={cn('text-xs text-ink-muted')}>
                {selectedCafeIds.length}개 선택
              </span>
              <button
                type="button"
                onClick={() => setSelectedCafeIds(cafes.map((c) => c.cafeId))}
                className={cn('text-xs text-accent hover:underline')}
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() => setSelectedCafeIds([])}
                className={cn('text-xs text-ink-muted hover:underline')}
              >
                선택 해제
              </button>
            </div>
          </div>
          <div className={cn('grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-xl border border-border-light bg-surface-muted p-3')}>
            {cafes.map((cafe) => {
              const isSelected = selectedCafeIds.includes(cafe.cafeId);
              return (
                <button
                  key={cafe.cafeId}
                  type="button"
                  onClick={() => {
                    setSelectedCafeIds((prev) =>
                      isSelected
                        ? prev.filter((id) => id !== cafe.cafeId)
                        : [...prev, cafe.cafeId]
                    );
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all',
                    isSelected
                      ? 'bg-accent/10 border-2 border-accent text-accent font-medium'
                      : 'bg-surface border-2 border-transparent hover:border-border text-ink'
                  )}
                >
                  <span
                    className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center text-xs flex-shrink-0',
                      isSelected
                        ? 'bg-accent border-accent text-background'
                        : 'border-border-light'
                    )}
                  >
                    {isSelected && '✓'}
                  </span>
                  <span className={cn('truncate')}>{cafe.name}</span>
                  {cafe.isDefault && (
                    <span className={cn('text-xs text-accent/70')}>(기본)</span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedCafes.length > 0 && (
            <p className={cn('text-xs text-ink-muted')}>
              카테고리: {categories.join(', ')}
            </p>
          )}
        </div>

        {/* 모델 선택 */}
        <Select
          label="AI 모델"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          options={MODELS}
        />

        {/* 계정 역할 선택 */}
        {accounts.length > 0 && (
          <div className={cn('space-y-3')}>
            <button
              type="button"
              onClick={() => setShowAccountRoles(!showAccountRoles)}
              className={cn('flex items-center justify-between w-full')}
            >
              <div className={cn('flex items-center gap-2')}>
                <span className={labelClassName}>계정 역할</span>
                <span className={cn('text-xs text-ink-muted')}>
                  글 {accounts.filter((a) => ['both', 'writer'].includes(accountRoles.get(a.id) || 'both')).length}개 /
                  댓글 {accounts.filter((a) => ['both', 'commenter'].includes(accountRoles.get(a.id) || 'both')).length}개
                </span>
              </div>
              <span className={cn('text-ink-muted text-sm transition-transform', showAccountRoles && 'rotate-180')}>
                ▼
              </span>
            </button>

            <div
              className={cn(
                'grid transition-all duration-300 ease-out',
                showAccountRoles ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div className={cn('overflow-hidden')}>
                <div className={cn('rounded-xl border border-border-light bg-surface-muted p-4 space-y-3')}>
                  {/* 일괄 설정 버튼 */}
                  <div className={cn('flex flex-wrap gap-2 pb-3 border-b border-border-light')}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Map<string, AccountRole>();
                        accounts.forEach((a) => next.set(a.id, 'both'));
                        setAccountRoles(next);
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        'bg-accent/10 text-accent hover:bg-accent/20'
                      )}
                    >
                      전체 글/댓글
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Map<string, AccountRole>();
                        accounts.forEach((a) => next.set(a.id, 'writer'));
                        setAccountRoles(next);
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        'bg-info/10 text-info hover:bg-info/20'
                      )}
                    >
                      전체 글만
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Map<string, AccountRole>();
                        accounts.forEach((a) => next.set(a.id, 'commenter'));
                        setAccountRoles(next);
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        'bg-success/10 text-success hover:bg-success/20'
                      )}
                    >
                      전체 댓글만
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Map<string, AccountRole>();
                        accounts.forEach((a) => next.set(a.id, 'disabled'));
                        setAccountRoles(next);
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        'bg-danger/10 text-danger hover:bg-danger/20'
                      )}
                    >
                      전체 비활성화
                    </button>
                  </div>

                  {/* 헤더 */}
                  <div className={cn('grid grid-cols-[1fr_60px_60px] gap-2 text-xs font-medium text-ink-muted px-1')}>
                    <span>계정</span>
                    <span className={cn('text-center')}>글</span>
                    <span className={cn('text-center')}>댓글</span>
                  </div>

                  {/* 계정 목록 */}
                  <div className={cn('space-y-1 max-h-60 overflow-y-auto')}>
                    {accounts.map((account) => {
                      const role = accountRoles.get(account.id) || 'both';
                      const canWrite = role === 'both' || role === 'writer';
                      const canComment = role === 'both' || role === 'commenter';

                      const toggleWrite = () => {
                        const next = new Map(accountRoles);
                        if (canWrite && canComment) next.set(account.id, 'commenter');
                        else if (canWrite && !canComment) next.set(account.id, 'disabled');
                        else if (!canWrite && canComment) next.set(account.id, 'both');
                        else next.set(account.id, 'writer');
                        setAccountRoles(next);
                      };

                      const toggleComment = () => {
                        const next = new Map(accountRoles);
                        if (canWrite && canComment) next.set(account.id, 'writer');
                        else if (!canWrite && canComment) next.set(account.id, 'disabled');
                        else if (canWrite && !canComment) next.set(account.id, 'both');
                        else next.set(account.id, 'commenter');
                        setAccountRoles(next);
                      };

                      return (
                        <div
                          key={account.id}
                          className={cn(
                            'grid grid-cols-[1fr_60px_60px] gap-2 items-center py-1.5 px-1 rounded-lg',
                            'hover:bg-surface transition-colors'
                          )}
                        >
                          <span className={cn('text-sm text-ink truncate')}>
                            {account.nickname || account.id}
                            {account.isMain && <span className={cn('ml-1 text-xs text-accent')}>(메인)</span>}
                          </span>
                          <button
                            type="button"
                            onClick={toggleWrite}
                            className={cn(
                              'w-6 h-6 mx-auto rounded-md border-2 transition-all flex items-center justify-center',
                              canWrite
                                ? 'bg-info border-info text-background'
                                : 'border-border-light hover:border-info/50'
                            )}
                          >
                            {canWrite && <span className={cn('text-xs')}>✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={toggleComment}
                            className={cn(
                              'w-6 h-6 mx-auto rounded-md border-2 transition-all flex items-center justify-center',
                              canComment
                                ? 'bg-success border-success text-background'
                                : 'border-border-light hover:border-success/50'
                            )}
                          >
                            {canComment && <span className={cn('text-xs')}>✓</span>}
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

        {/* 이미지 옵션 */}
        <div className={cn('space-y-3')}>
          <Checkbox
            label="이미지 첨부"
            checked={enableImage}
            onChange={(e) => setEnableImage(e.target.checked)}
          />
          {enableImage && (
            <div className={cn('pl-8 space-y-4')}>
              {/* 이미지 소스 선택 */}
              <div className={cn('flex gap-2')}>
                <button
                  type="button"
                  onClick={() => setImageSource('search')}
                  className={cn(
                    'flex-1 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
                    imageSource === 'search'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-light bg-surface text-ink-muted hover:border-border'
                  )}
                >
                  <div className={cn('flex flex-col items-center gap-1')}>
                    <span className={cn('text-lg')}>🔍</span>
                    <span>구글 검색</span>
                    <span className={cn('text-xs opacity-70')}>랜덤 액자/필터</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setImageSource('ai')}
                  className={cn(
                    'flex-1 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
                    imageSource === 'ai'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-light bg-surface text-ink-muted hover:border-border'
                  )}
                >
                  <div className={cn('flex flex-col items-center gap-1')}>
                    <span className={cn('text-lg')}>🎨</span>
                    <span>AI 생성</span>
                    <span className={cn('text-xs opacity-70')}>DALL-E / Imagen</span>
                  </div>
                </button>
              </div>

              {/* 장수 선택 */}
              <Select
                label="장수"
                value={String(imageCount)}
                onChange={(e) => setImageCount(Number(e.target.value))}
                options={[
                  { value: '0', label: '랜덤 1~2장' },
                  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                    value: String(n),
                    label: `${n}장`,
                  })),
                ]}
                fullWidth={false}
                className="w-32"
              />
            </div>
          )}
        </div>

        {/* 게시 옵션 */}
        <div className={cn('space-y-3')}>
          <span className={labelClassName}>게시 옵션</span>
          <div className={cn('rounded-xl border border-border-light bg-surface-muted p-4')}>
            <PostOptionsUI options={postOptions} onChange={setPostOptions} />
          </div>
        </div>
      </div>

      {/* 바이럴 배치 가이드 */}
      <div className={cn('rounded-xl border border-info/20 bg-info-soft p-4 space-y-4')}>
        {/* 스타일 가이드 */}
        <div className={cn('space-y-1.5')}>
          <p className={cn('text-sm font-semibold text-info')}>원고 스타일</p>
          <div className={cn('text-xs text-info/80 space-y-0.5')}>
            <p><strong>자사키워드</strong> (기본): 300~500자 고민글 · 댓글에서 제품 추천 · 바이럴 광고</p>
            <p><strong>일상</strong>: 1~3문장 혼잣말 · 광고 없음 · 카페 활동용</p>
            <p><strong>애니</strong>: 애니메이션 캐릭터 스타일</p>
          </div>
        </div>

        {/* 키워드 분류 */}
        <div className={cn('space-y-1.5')}>
          <p className={cn('text-sm font-semibold text-info')}>키워드 자동 분류</p>
          <div className={cn('text-xs text-info/80 space-y-0.5')}>
            <p><strong>자사</strong>: 기력보충, 흐염소, 피로회복 등 → 직접 제품 홍보</p>
            <p><strong>타사</strong>: 경쟁 제품명 → 중립적 질문 후 대안 제시</p>
          </div>
        </div>

        {/* 댓글 태그 규칙 */}
        <div className={cn('space-y-1.5')}>
          <p className={cn('text-sm font-semibold text-info')}>댓글 태그 규칙</p>
          <div className={cn('grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-info/80')}>
            <p><code className={cn('bg-info/10 px-1 rounded')}>[댓글N]</code> 일반 댓글</p>
            <p><code className={cn('bg-info/10 px-1 rounded')}>[작성자-N]</code> 글쓴이 대댓</p>
            <p><code className={cn('bg-info/10 px-1 rounded')}>[댓글러-N]</code> 댓글 작성자 대댓</p>
            <p><code className={cn('bg-info/10 px-1 rounded')}>[제3자-N]</code> 제3자 대댓</p>
          </div>
        </div>

        {/* 특징 */}
        <div className={cn('text-xs text-info/70 flex flex-wrap gap-2')}>
          <span className={cn('bg-info/10 px-2 py-0.5 rounded-full')}>AI 1회 호출로 전체 생성</span>
          <span className={cn('bg-info/10 px-2 py-0.5 rounded-full')}>맥락 기반 댓글 흐름</span>
          <span className={cn('bg-info/10 px-2 py-0.5 rounded-full')}>태그 자동 파싱</span>
        </div>
      </div>

      {/* 실행 확인 모달 */}
      <ExecuteConfirmModal
        isOpen={showExecuteModal}
        onClose={() => setShowExecuteModal(false)}
        onConfirm={handleRun}
        title="바이럴 배치를 실행하시겠습니까?"
        description="아래 설정으로 바이럴 콘텐츠가 생성됩니다."
        settings={[
          { label: '키워드', value: `${keywordCount}개`, highlight: true },
          { label: '카페', value: selectedCafeIds.length > 0 ? `${selectedCafeIds.length}개 (${selectedCafes.map((c) => c.name).join(', ')})` : '선택 안됨' },
          {
            label: 'AI 모델',
            value: MODELS.find((m) => m.value === model)?.label || '기본 (Gemini 3.1 Pro)',
          },
          {
            label: '이미지',
            value: enableImage
              ? `${imageSource === 'ai' ? 'AI 생성' : '구글 검색'} / ${imageCount === 0 ? '랜덤 1~2장' : `${imageCount}장`}`
              : '사용 안함',
          },
          {
            label: '글 작성 계정',
            value: `${accounts.filter((a) => ['both', 'writer'].includes(accountRoles.get(a.id) || 'both')).length}개`,
          },
          {
            label: '댓글 작성 계정',
            value: `${accounts.filter((a) => ['both', 'commenter'].includes(accountRoles.get(a.id) || 'both')).length}개`,
          },
        ]}
        confirmText="실행"
        isLoading={isPending}
      />

      {/* 실행 버튼 */}
      <Button
        onClick={handleRunClick}
        disabled={keywordCount === 0}
        isLoading={isPending}
        size="lg"
        fullWidth
      >
        바이럴 배치 실행 ({keywordCount}개)
      </Button>

      {/* 실시간 진행 결과 */}
      <AnimatePresence>
        {isPending && partialResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn('space-y-2')}
          >
            <div className={cn('flex items-center justify-between')}>
              <span className={cn('text-sm font-medium text-ink')}>진행 중...</span>
              <span className={cn('text-xs text-ink-muted')}>
                성공 {partialResults.filter((r) => r.success).length} / 실패{' '}
                {partialResults.filter((r) => !r.success).length}
              </span>
            </div>
            <div className={cn('space-y-1.5 max-h-60 overflow-y-auto')}>
              {partialResults.map((r, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                    r.success ? 'bg-success/10' : 'bg-danger/10'
                  )}
                >
                  <span className={r.success ? 'text-success' : 'text-danger'}>
                    {r.success ? '✓' : '✗'}
                  </span>
                  <span className={cn('font-medium text-ink')}>{r.keyword}</span>
                  {r.success && r.title && (
                    <span className={cn('text-ink-muted truncate flex-1')}>{r.title}</span>
                  )}
                  {!r.success && r.error && (
                    <span className={cn('text-danger/80 truncate flex-1')}>{r.error}</span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 최종 결과 */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn('space-y-4')}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className={cn(
                'rounded-xl border p-4',
                result.success
                  ? 'border-success/30 bg-success-soft'
                  : 'border-warning/30 bg-warning-soft'
              )}
            >
              <div className={cn('flex items-center justify-between')}>
                <h4
                  className={cn(
                    'text-base font-semibold',
                    result.success ? 'text-success' : 'text-warning'
                  )}
                >
                  {result.success ? '배치 완료' : '부분 완료'}
                </h4>
                <span className={cn('text-sm text-ink-muted')}>
                  {result.completed}/{result.totalKeywords} 성공
                </span>
              </div>
            </motion.div>

            {/* 개별 결과 */}
            <div className={cn('space-y-2')}>
              {result.results.map((r, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    'rounded-xl border p-4',
                    r.success
                      ? 'border-success/20 bg-success-soft'
                      : 'border-danger/20 bg-danger-soft'
                  )}
                >
                  <div className={cn('flex items-center justify-between')}>
                    <div className={cn('flex items-center gap-2')}>
                      <span
                        className={cn(
                          'text-sm font-semibold px-2.5 py-1 rounded-lg',
                          r.success ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
                        )}
                      >
                        {r.keyword}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-md font-medium',
                          r.keywordType === 'own'
                            ? 'text-info bg-info/10'
                            : 'text-warning bg-warning/10'
                        )}
                      >
                        {r.keywordType === 'own' ? '자사' : '타사'}
                      </span>
                    </div>
                    {r.success && (
                      <span className={cn('text-sm text-success')}>
                        댓글 {r.commentCount}개, 대댓글 {r.replyCount}개
                      </span>
                    )}
                  </div>
                  {r.success && r.title && (
                    <p className={cn('text-sm text-success/80 mt-2 truncate')}>{r.title}</p>
                  )}
                  {!r.success && r.error && (
                    <p className={cn('text-sm text-danger/80 mt-2')}>{r.error}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
