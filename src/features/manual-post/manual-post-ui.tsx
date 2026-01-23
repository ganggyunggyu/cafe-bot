'use client';

import { useEffect, useState, useTransition, useCallback, type DragEvent } from 'react';
import { useAtom } from 'jotai';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { Select, Button, ConfirmModal, ExecuteConfirmModal } from '@/shared/ui';
import { runManualPublishAction, runManualModifyAction } from './manual-actions';
import { PostOptionsUI } from '@/features/auto-comment/batch/post-options-ui';
import {
  postOptionsAtom,
  cafesAtom,
  selectedCafeIdAtom,
  cafesInitializedAtom,
} from '@/entities/store';
import { getCafesAction } from '@/features/accounts/actions';
import type {
  ManuscriptFolder,
  ManualPublishResult,
  ManualModifyResult,
} from './types';
import {
  parseManuscriptText,
  convertBodyToHtml,
} from './types';

type Mode = 'publish' | 'modify';
type SortOrder = 'oldest' | 'newest' | 'random';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

const isImageFile = (name: string): boolean => {
  const lowerName = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const parseManuscriptFolders = async (
  items: DataTransferItemList
): Promise<ManuscriptFolder[]> => {
  const manuscripts: ManuscriptFolder[] = [];
  const folderMap = new Map<string, { text?: string; images: string[] }>();

  const processEntry = async (entry: FileSystemEntry, parentPath: string = '') => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve) => fileEntry.file(resolve));
      const pathParts = entry.fullPath.split('/').filter(Boolean);

      if (pathParts.length >= 2) {
        const folderName = pathParts[1];

        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, { images: [] });
        }

        const folder = folderMap.get(folderName)!;

        if (file.name.endsWith('.txt')) {
          const text = await file.text();
          folder.text = text;
        } else if (isImageFile(file.name)) {
          const base64 = await fileToBase64(file);
          folder.images.push(base64);
        }
      }
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();

      const entries = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(resolve);
      });

      for (const childEntry of entries) {
        await processEntry(childEntry, entry.fullPath);
      }
    }
  };

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = item.webkitGetAsEntry();
    if (entry) {
      entries.push(entry);
    }
  }

  for (const entry of entries) {
    await processEntry(entry);
  }

  for (const [folderName, data] of folderMap) {
    if (data.text) {
      const { title, body } = parseManuscriptText(data.text);
      const htmlContent = convertBodyToHtml(body);

      const parts = folderName.split(':');
      const actualFolderName = parts[0].trim();
      const category = parts.length > 1 ? parts.slice(1).join(':').trim() : undefined;

      manuscripts.push({
        folderName: actualFolderName,
        title,
        body,
        htmlContent,
        images: data.images,
        category,
      });
    }
  }

  return manuscripts;
};

export const ManualPostUI = () => {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>('publish');
  const [manuscripts, setManuscripts] = useState<ManuscriptFolder[]>([]);
  const [cafes, setCafes] = useAtom(cafesAtom);
  const [selectedCafeId, setSelectedCafeId] = useAtom(selectedCafeIdAtom);
  const [cafesInitialized, setCafesInitialized] = useAtom(cafesInitializedAtom);
  const [postOptions, setPostOptions] = useAtom(postOptionsAtom);
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [daysLimit, setDaysLimit] = useState<number | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [publishResult, setPublishResult] = useState<ManualPublishResult | null>(null);
  const [modifyResult, setModifyResult] = useState<ManualModifyResult | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');

  useEffect(() => {
    if (cafesInitialized) return;

    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) {
        setSelectedCafeId(defaultCafe.cafeId);
      }
      setCafesInitialized(true);
    };
    loadCafes();
  }, [cafesInitialized, setCafes, setSelectedCafeId, setCafesInitialized]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    if (items.length > 0) {
      const parsed = await parseManuscriptFolders(items);
      setManuscripts(parsed);
      console.log('[MANUAL UI] 파싱된 원고:', parsed.length, '개');
    }
  }, []);

  const handleRun = () => {
    if (manuscripts.length === 0) return;

    startTransition(async () => {
      setPublishResult(null);
      setModifyResult(null);

      try {
        if (mode === 'publish') {
          const res = await runManualPublishAction({
            manuscripts,
            cafeId: selectedCafeId || undefined,
            postOptions,
          });
          setPublishResult(res);
        } else {
          const res = await runManualModifyAction({
            manuscripts,
            cafeId: selectedCafeId || undefined,
            sortOrder,
            daysLimit,
          });
          setModifyResult(res);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        if (mode === 'publish') {
          setPublishResult({
            success: false,
            totalManuscripts: manuscripts.length,
            completed: 0,
            failed: manuscripts.length,
            results: manuscripts.map((m) => ({
              folderName: m.folderName,
              title: m.title,
              success: false,
              error: errorMessage,
            })),
          });
        } else {
          setModifyResult({
            success: false,
            totalManuscripts: manuscripts.length,
            completed: 0,
            failed: manuscripts.length,
            results: manuscripts.map((m) => ({
              folderName: m.folderName,
              originalArticleId: 0,
              newTitle: m.title,
              success: false,
              error: errorMessage,
            })),
          });
        }
      }
    });
  };

  const clearManuscripts = () => {
    setManuscripts([]);
    setPublishResult(null);
    setModifyResult(null);
    setShowClearModal(false);
  };

  const handleRunClick = () => {
    if (manuscripts.length === 0) return;
    setShowExecuteModal(true);
  };

  const handleConfirmedRun = () => {
    setShowExecuteModal(false);
    handleRun();
  };

  const result = mode === 'publish' ? publishResult : modifyResult;

  return (
    <div className={cn('space-y-6')}>
      {/* 모드 선택 */}
      <div className={cn('flex gap-2')}>
        {[
          { id: 'publish', label: '발행' },
          { id: 'modify', label: '수정' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id as Mode)}
            className={cn(
              'relative px-5 py-2.5 rounded-xl text-sm font-medium transition-colors',
              mode === tab.id
                ? 'text-(--background)'
                : 'bg-(--surface) border border-(--border) text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)'
            )}
          >
            {mode === tab.id && (
              <motion.div
                layoutId="manualPostTab"
                className={cn('absolute inset-0 bg-(--accent) rounded-xl')}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className={cn('relative z-10')}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 드래그앤드랍 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'rounded-2xl border-2 border-dashed p-10 text-center transition-all',
          isDragging
            ? 'border-(--accent) bg-(--accent)/5'
            : 'border-(--border) bg-(--surface-muted)',
          manuscripts.length > 0 && 'border-(--success) bg-(--success-soft)'
        )}
      >
        {manuscripts.length === 0 ? (
          <div className={cn('space-y-2')}>
            <p className={cn('text-base font-medium text-(--ink)')}>
              폴더를 여기에 드래그앤드랍하세요
            </p>
            <p className={cn('text-sm text-(--ink-muted)')}>
              상위폴더 &gt; 하위폴더(원고.txt + 이미지) 구조
            </p>
          </div>
        ) : (
          <div className={cn('space-y-3')}>
            <p className={cn('text-base font-semibold text-(--success)')}>
              {manuscripts.length}개 원고 준비됨
            </p>
            <Button
              variant="danger"
              size="xs"
              onClick={() => setShowClearModal(true)}
            >
              초기화
            </Button>
          </div>
        )}
      </div>

      {/* 원고 목록 미리보기 */}
      {manuscripts.length > 0 && (
        <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-5 space-y-3')}>
          <h4 className={cn('text-sm font-semibold text-(--ink)')}>원고 목록</h4>
          <div className={cn('max-h-48 overflow-y-auto space-y-2')}>
            {manuscripts.map((m, idx) => (
              <div
                key={idx}
                className={cn('flex items-center justify-between text-sm py-2 border-b border-(--border-light) last:border-0')}
              >
                <div className={cn('flex items-center gap-2')}>
                  <span className={cn('font-medium text-(--ink)')}>{m.folderName}</span>
                  {m.category && (
                    <span className={cn('px-2 py-0.5 rounded-md bg-(--info-soft) text-(--info) text-xs font-medium')}>
                      {m.category}
                    </span>
                  )}
                </div>
                <div className={cn('flex items-center gap-2 text-(--ink-muted)')}>
                  <span className={cn('truncate max-w-40')}>{m.title}</span>
                  {m.images.length > 0 && (
                    <span className={cn('px-2 py-0.5 rounded-md bg-(--surface-muted) text-xs')}>
                      이미지 {m.images.length}장
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 설정 섹션 */}
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-5')}>
        <h3 className={cn('text-base font-semibold text-(--ink)')}>설정</h3>

        {/* 카페 선택 */}
        <Select
          label="카페 선택"
          value={selectedCafeId}
          onChange={(e) => setSelectedCafeId(e.target.value)}
          options={cafes.map((cafe) => ({
            value: cafe.cafeId,
            label: `${cafe.name}${cafe.isDefault ? ' (기본)' : ''}`,
          }))}
        />

        {/* 발행 모드: 게시 옵션 */}
        {mode === 'publish' && (
          <div className={cn('space-y-3')}>
            <span className={labelClassName}>게시 옵션</span>
            <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-4')}>
              <PostOptionsUI options={postOptions} onChange={setPostOptions} />
            </div>
          </div>
        )}

        {/* 수정 모드: 정렬 및 필터 옵션 */}
        {mode === 'modify' && (
          <div className={cn('grid gap-4 md:grid-cols-2')}>
            <Select
              label="정렬 순서"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              options={[
                { value: 'oldest', label: '오래된 순' },
                { value: 'newest', label: '최신 순' },
                { value: 'random', label: '랜덤' },
              ]}
            />

            <div className={cn('space-y-2')}>
              <label className={labelClassName}>기간 제한 (일)</label>
              <input
                type="number"
                value={daysLimit ?? ''}
                onChange={(e) => setDaysLimit(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="미지정 시 전체"
                className={inputClassName}
                min={1}
              />
            </div>
          </div>
        )}
      </div>

      {/* 폴더 구조 안내 */}
      <div className={cn('rounded-xl border border-(--info)/20 bg-(--info-soft) p-4 space-y-2')}>
        <p className={cn('text-sm font-semibold text-(--info)')}>폴더 구조 안내</p>
        <pre className={cn('text-xs text-(--info)/80 font-mono leading-relaxed')}>
{`상위폴더/
├── 원고1/
│   ├── 원고.txt (첫 줄: 제목, 이후: 본문)
│   ├── image1.jpg
│   └── image2.png
├── 원고2:카테고리/  (폴더명에 카테고리 지정 가능)
│   └── 원고.txt
└── ...`}
        </pre>
      </div>

      {/* 초기화 확인 모달 */}
      <ConfirmModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={clearManuscripts}
        title="원고 목록을 초기화하시겠습니까?"
        description={`${manuscripts.length}개 원고가 삭제됩니다.`}
        variant="danger"
        confirmText="초기화"
        cancelText="취소"
      />

      {/* 실행 확인 모달 */}
      <ExecuteConfirmModal
        isOpen={showExecuteModal}
        onClose={() => setShowExecuteModal(false)}
        onConfirm={handleConfirmedRun}
        title={mode === 'publish' ? '원고를 발행하시겠습니까?' : '원고를 수정하시겠습니까?'}
        description="아래 설정으로 작업이 진행됩니다."
        settings={[
          { label: '원고 수', value: `${manuscripts.length}개`, highlight: true },
          { label: '카페', value: cafes.find((c) => c.cafeId === selectedCafeId)?.name || '선택 안됨' },
          ...(mode === 'modify'
            ? [
                { label: '정렬', value: sortOrder === 'oldest' ? '오래된 순' : sortOrder === 'newest' ? '최신 순' : '랜덤' },
                { label: '기간', value: daysLimit ? `${daysLimit}일 이내` : '전체' },
              ]
            : []),
        ]}
        confirmText={mode === 'publish' ? '발행' : '수정'}
        isLoading={isPending}
      />

      {/* 실행 버튼 */}
      <Button
        onClick={handleRunClick}
        disabled={manuscripts.length === 0}
        isLoading={isPending}
        size="lg"
        fullWidth
      >
        {mode === 'publish'
          ? `원고 발행 (${manuscripts.length}개)`
          : `원고 수정 (${manuscripts.length}개)`
        }
      </Button>

      {/* 결과 */}
      {result && (
        <div className={cn('space-y-4')}>
          <div
            className={cn(
              'rounded-xl border p-4',
              result.success
                ? 'border-(--success)/30 bg-(--success-soft)'
                : 'border-(--warning)/30 bg-(--warning-soft)'
            )}
          >
            <div className={cn('flex items-center justify-between')}>
              <h4
                className={cn(
                  'text-base font-semibold',
                  result.success ? 'text-(--success)' : 'text-(--warning)'
                )}
              >
                {result.success ? '완료' : '부분 완료'}
              </h4>
              <span className={cn('text-sm text-(--ink-muted)')}>
                {result.completed}/{result.totalManuscripts} 성공
              </span>
            </div>
          </div>

          {/* 개별 결과 */}
          <div className={cn('space-y-2')}>
            {result.results.map((r, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-xl border p-4',
                  r.success
                    ? 'border-(--success)/20 bg-(--success-soft)'
                    : 'border-(--danger)/20 bg-(--danger-soft)'
                )}
              >
                <div className={cn('flex items-center justify-between')}>
                  <span
                    className={cn(
                      'text-sm font-semibold px-2.5 py-1 rounded-lg',
                      r.success ? 'text-(--success) bg-(--success)/10' : 'text-(--danger) bg-(--danger)/10'
                    )}
                  >
                    {r.folderName}
                  </span>
                  {r.success && (
                    <span className={cn('text-sm text-(--success)')}>
                      {mode === 'modify' && 'originalArticleId' in r
                        ? `#${(r as { originalArticleId: number }).originalArticleId}`
                        : ''
                      }
                    </span>
                  )}
                </div>
                {'title' in r && r.success && (
                  <p className={cn('text-sm text-(--success)/80 mt-2 truncate')}>
                    {(r as { title: string }).title}
                  </p>
                )}
                {'newTitle' in r && r.success && (
                  <p className={cn('text-sm text-(--success)/80 mt-2 truncate')}>
                    {(r as { newTitle: string }).newTitle}
                  </p>
                )}
                {!r.success && r.error && (
                  <p className={cn('text-sm text-(--danger)/80 mt-2')}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
