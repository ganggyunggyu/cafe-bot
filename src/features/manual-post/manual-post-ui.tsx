'use client';

import { useEffect, useState, useTransition, useCallback, type DragEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { runManualPublishAction, runManualModifyAction } from './manual-actions';
import { PostOptionsUI } from '@/features/auto-comment/batch/post-options-ui';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '@/features/auto-comment/batch/types';
import { getCafesAction } from '@/features/accounts/actions';
import type { CafeConfig } from '@/entities/cafe';
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

      // 상위 폴더 > 하위 폴더 구조에서 하위 폴더명 추출
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

  // Map을 ManuscriptFolder 배열로 변환
  for (const [folderName, data] of folderMap) {
    if (data.text) {
      const { title, body } = parseManuscriptText(data.text);
      const htmlContent = convertBodyToHtml(body);

      // 폴더명에서 카테고리 추출 (폴더명:카테고리 형식 지원)
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
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [postOptions, setPostOptions] = useState<PostOptions>(DEFAULT_POST_OPTIONS);
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [daysLimit, setDaysLimit] = useState<number | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [publishResult, setPublishResult] = useState<ManualPublishResult | null>(null);
  const [modifyResult, setModifyResult] = useState<ManualModifyResult | null>(null);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm',
    'placeholder:text-(--ink-muted) shadow-sm transition',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/20'
  );

  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) {
        setSelectedCafeId(defaultCafe.cafeId);
      }
    };
    loadCafes();
  }, []);

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
  };

  const result = mode === 'publish' ? publishResult : modifyResult;

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>Manual Post</p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>수동 원고 발행/수정</h2>
        <p className={cn('text-xs text-(--ink-muted)')}>
          폴더를 드래그앤드랍하여 원고를 업로드하고 발행하거나 기존 글을 수정합니다.
        </p>
      </div>

      {/* 모드 선택 */}
      <div className={cn('flex gap-2')}>
        <button
          onClick={() => setMode('publish')}
          className={cn(
            'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition',
            mode === 'publish'
              ? 'bg-(--accent) text-white'
              : 'bg-white/80 text-(--ink-muted) border border-(--border)'
          )}
        >
          발행
        </button>
        <button
          onClick={() => setMode('modify')}
          className={cn(
            'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition',
            mode === 'modify'
              ? 'bg-(--accent) text-white'
              : 'bg-white/80 text-(--ink-muted) border border-(--border)'
          )}
        >
          수정
        </button>
      </div>

      {/* 드래그앤드랍 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'rounded-2xl border-2 border-dashed p-8 text-center transition',
          isDragging
            ? 'border-(--accent) bg-(--accent)/10'
            : 'border-(--border) bg-white/50',
          manuscripts.length > 0 && 'border-green-400 bg-green-50'
        )}
      >
        {manuscripts.length === 0 ? (
          <div className={cn('space-y-2')}>
            <p className={cn('text-sm text-(--ink)')}>
              폴더를 여기에 드래그앤드랍하세요
            </p>
            <p className={cn('text-xs text-(--ink-muted)')}>
              상위폴더 &gt; 하위폴더(원고.txt + 이미지) 구조
            </p>
          </div>
        ) : (
          <div className={cn('space-y-2')}>
            <p className={cn('text-sm font-semibold text-green-700')}>
              {manuscripts.length}개 원고 준비됨
            </p>
            <button
              onClick={clearManuscripts}
              className={cn('text-xs text-red-500 underline')}
            >
              초기화
            </button>
          </div>
        )}
      </div>

      {/* 원고 목록 미리보기 */}
      {manuscripts.length > 0 && (
        <div className={cn('rounded-xl border border-(--border) bg-white/70 p-3 space-y-2')}>
          <h4 className={cn('text-xs font-semibold text-(--ink-muted)')}>원고 목록</h4>
          <div className={cn('max-h-40 overflow-y-auto space-y-1')}>
            {manuscripts.map((m, idx) => (
              <div
                key={idx}
                className={cn('flex items-center justify-between text-xs py-1 border-b border-(--border) last:border-0')}
              >
                <div className={cn('flex items-center gap-2')}>
                  <span className={cn('font-medium text-(--ink)')}>{m.folderName}</span>
                  {m.category && (
                    <span className={cn('px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 text-[10px]')}>
                      {m.category}
                    </span>
                  )}
                </div>
                <div className={cn('flex items-center gap-2 text-(--ink-muted)')}>
                  <span className={cn('truncate max-w-32')}>{m.title}</span>
                  {m.images.length > 0 && (
                    <span className={cn('px-1.5 py-0.5 rounded bg-gray-100 text-[10px]')}>
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
      <div className={cn('rounded-2xl border border-(--border) bg-white/70 p-4 shadow-sm space-y-3')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>설정</h3>

        {/* 카페 선택 */}
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>카페 선택</label>
          <select
            value={selectedCafeId}
            onChange={(e) => setSelectedCafeId(e.target.value)}
            className={inputClassName}
          >
            {cafes.map((cafe) => (
              <option key={cafe.cafeId} value={cafe.cafeId}>
                {cafe.name} {cafe.isDefault ? '(기본)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 발행 모드: 게시 옵션 */}
        {mode === 'publish' && (
          <div className={cn('space-y-2')}>
            <span className={cn('text-xs font-medium text-(--ink-muted)')}>게시 옵션</span>
            <div className={cn('rounded-xl border border-(--border) bg-white/80 p-3')}>
              <PostOptionsUI options={postOptions} onChange={setPostOptions} />
            </div>
          </div>
        )}

        {/* 수정 모드: 정렬 및 필터 옵션 */}
        {mode === 'modify' && (
          <>
            <div className={cn('space-y-1')}>
              <label className={cn('text-xs font-medium text-(--ink-muted)')}>정렬 순서</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className={inputClassName}
              >
                <option value="oldest">오래된 순</option>
                <option value="newest">최신 순</option>
                <option value="random">랜덤</option>
              </select>
            </div>

            <div className={cn('space-y-1')}>
              <label className={cn('text-xs font-medium text-(--ink-muted)')}>
                기간 제한 (일)
              </label>
              <input
                type="number"
                value={daysLimit ?? ''}
                onChange={(e) => setDaysLimit(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="미지정 시 전체"
                className={inputClassName}
                min={1}
              />
            </div>
          </>
        )}
      </div>

      {/* 폴더 구조 안내 */}
      <div className={cn('rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-1')}>
        <p className={cn('text-xs font-semibold text-blue-700')}>폴더 구조 안내</p>
        <pre className={cn('text-xs text-blue-600 font-mono')}>
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

      {/* 실행 버튼 */}
      <button
        onClick={handleRun}
        disabled={isPending || manuscripts.length === 0}
        className={cn(
          'w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition',
          mode === 'publish'
            ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105'
            : 'bg-[linear-gradient(135deg,#f59e0b,#d97706)] hover:brightness-105',
          'disabled:opacity-60 disabled:cursor-not-allowed'
        )}
      >
        {isPending
          ? (mode === 'publish' ? '발행 중...' : '수정 중...')
          : (mode === 'publish'
              ? `원고 발행 (${manuscripts.length}개)`
              : `원고 수정 (${manuscripts.length}개)`
            )
        }
      </button>

      {/* 결과 */}
      {result && (
        <div className={cn('space-y-3')}>
          <div
            className={cn(
              'rounded-xl border px-3 py-3',
              result.success ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
            )}
          >
            <div className={cn('flex items-center justify-between')}>
              <h4
                className={cn(
                  'text-sm font-semibold',
                  result.success ? 'text-green-700' : 'text-amber-700'
                )}
              >
                {result.success ? '완료' : '부분 완료'}
              </h4>
              <span className={cn('text-xs text-(--ink-muted)')}>
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
                  'rounded-lg border px-3 py-2',
                  r.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                )}
              >
                <div className={cn('flex items-center justify-between')}>
                  <span
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded',
                      r.success ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'
                    )}
                  >
                    {r.folderName}
                  </span>
                  {r.success && (
                    <span className={cn('text-xs text-green-600')}>
                      {mode === 'modify' && 'originalArticleId' in r
                        ? `#${(r as { originalArticleId: number }).originalArticleId}`
                        : ''
                      }
                    </span>
                  )}
                </div>
                {'title' in r && r.success && (
                  <p className={cn('text-xs text-green-700 mt-1 truncate')}>
                    {(r as { title: string }).title}
                  </p>
                )}
                {'newTitle' in r && r.success && (
                  <p className={cn('text-xs text-green-700 mt-1 truncate')}>
                    {(r as { newTitle: string }).newTitle}
                  </p>
                )}
                {!r.success && r.error && (
                  <p className={cn('text-xs text-red-600 mt-1')}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
