'use client';

import { useState, useTransition, useCallback, DragEvent, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select, Button } from '@/shared/ui';
import { getCafesAction } from '@/features/accounts/actions';
import { PostOptionsUI } from '../batch/post-options-ui';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '../batch/types';
import { runManuscriptUploadAction, runManuscriptModifyAction } from './manuscript-actions';
import type {
  ManuscriptFolder,
  ManuscriptImage,
  ManuscriptUploadResult,
  ManuscriptModifyResult,
  ManuscriptSortOrder,
} from './types';

interface CafeConfig {
  cafeId: string;
  menuId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
}

type ManuscriptMode = 'publish' | 'modify';

const parseFolderName = (folderName: string): { name: string; category?: string } => {
  const lastUnderscoreIndex = folderName.lastIndexOf('_');
  if (lastUnderscoreIndex === -1) {
    return { name: folderName };
  }
  return {
    name: folderName.slice(0, lastUnderscoreIndex),
    category: folderName.slice(lastUnderscoreIndex + 1),
  };
};

const isImageFile = (fileName: string): boolean => {
  const ext = fileName.toLowerCase().split('.').pop();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext || '');
};

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const fileToText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

export const ManuscriptUploadUI = () => {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<ManuscriptMode>('publish');
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [postOptions, setPostOptions] = useState<PostOptions>(DEFAULT_POST_OPTIONS);
  const [manuscripts, setManuscripts] = useState<ManuscriptFolder[]>([]);
  const [result, setResult] = useState<ManuscriptUploadResult | ManuscriptModifyResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<ManuscriptSortOrder>('oldest');
  const [daysLimit, setDaysLimit] = useState<number>(0);

  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) setSelectedCafeId(defaultCafe.cafeId);
    };
    loadCafes();
  }, []);

  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');
  const helperClassName = cn('text-xs text-(--ink-muted) mt-1');

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    setParseError(null);

    const items = e.dataTransfer.items;
    const parsedManuscripts: ManuscriptFolder[] = [];
    const folderMap = new Map<string, { content?: string; images: ManuscriptImage[] }>();

    const processEntry = async (entry: FileSystemEntry, parentPath: string = ''): Promise<void> => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });

        const pathParts = parentPath.split('/').filter(Boolean);
        if (pathParts.length < 1) return;

        const folderName = pathParts[pathParts.length - 1];

        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, { images: [] });
        }

        const folderData = folderMap.get(folderName)!;

        if (file.name === '원고.txt' || file.name.endsWith('.txt')) {
          folderData.content = await fileToText(file);
        } else if (isImageFile(file.name)) {
          const dataUrl = await fileToDataUrl(file);
          folderData.images.push({ name: file.name, dataUrl });
        }
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const dirReader = dirEntry.createReader();

        const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });

        for (const childEntry of entries) {
          await processEntry(childEntry, `${parentPath}/${entry.name}`);
        }
      }
    };

    try {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) {
          await processEntry(entry, '');
        }
      }

      for (const [folderName, data] of folderMap) {
        if (!data.content) {
          console.warn(`[MANUSCRIPT] ${folderName}: 원고.txt 없음, 스킵`);
          continue;
        }

        const { name, category } = parseFolderName(folderName);
        parsedManuscripts.push({
          name,
          category,
          content: data.content,
          images: data.images,
        });
      }

      if (parsedManuscripts.length === 0) {
        setParseError('유효한 원고 폴더가 없습니다. 각 폴더에 원고.txt가 있어야 합니다.');
        return;
      }

      if (parsedManuscripts.length > 100) {
        setParseError('최대 100개까지만 업로드 가능합니다.');
        parsedManuscripts.splice(100);
      }

      setManuscripts(parsedManuscripts);
    } catch (error) {
      console.error('[MANUSCRIPT] 파싱 에러:', error);
      setParseError('폴더 파싱 중 오류 발생');
    }
  }, []);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleSubmit = () => {
    if (manuscripts.length === 0) return;

    startTransition(async () => {
      setResult(null);
      if (mode === 'publish') {
        const res = await runManuscriptUploadAction({
          manuscripts,
          cafeId: selectedCafeId || undefined,
          postOptions,
        });
        setResult(res);
      } else {
        const res = await runManuscriptModifyAction({
          manuscripts,
          cafeId: selectedCafeId || undefined,
          sortOrder,
          daysLimit: daysLimit > 0 ? daysLimit : undefined,
        });
        setResult(res);
      }
    });
  };

  const handleClear = () => {
    setManuscripts([]);
    setResult(null);
    setParseError(null);
  };

  const groupedByCategory = manuscripts.reduce((acc, m) => {
    const cat = m.category || '미지정';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {} as Record<string, ManuscriptFolder[]>);

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('flex gap-2')}>
        <Button
          variant={mode === 'publish' ? 'primary' : 'secondary'}
          onClick={() => { setMode('publish'); setResult(null); }}
          className="flex-1"
        >
          발행 (새 글)
        </Button>
        <Button
          variant={mode === 'modify' ? 'primary' : 'secondary'}
          onClick={() => { setMode('modify'); setResult(null); }}
          className="flex-1"
        >
          수정 (기존 글)
        </Button>
      </div>

      <div className={cn('space-y-4')}>
        <Select
          label="카페 선택"
          value={selectedCafeId}
          onChange={(e) => setSelectedCafeId(e.target.value)}
          options={cafes.map((cafe) => ({
            value: cafe.cafeId,
            label: `${cafe.name}${cafe.isDefault ? ' (기본)' : ''}`,
          }))}
          helperText={selectedCafe && `카테고리: ${selectedCafe.categories.join(', ')}`}
        />

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
            isDragOver
              ? 'border-(--accent) bg-(--accent)/5'
              : 'border-(--border) bg-(--surface) hover:border-(--accent)/50'
          )}
        >
          {manuscripts.length === 0 ? (
            <>
              <div className={cn('text-4xl mb-3')}>📁</div>
              <p className={cn('font-medium text-(--ink)')}>
                원고 폴더를 여기에 드래그
              </p>
              <p className={cn('text-xs text-(--ink-muted) mt-2')}>
                폴더명 형식: 원고명_카테고리 (예: 제주도여행_일상)
              </p>
              <p className={cn('text-xs text-(--ink-muted)')}>
                각 폴더에 원고.txt + 이미지 파일
              </p>
            </>
          ) : (
            <>
              <p className={cn('font-medium text-(--ink) mb-2')}>
                {manuscripts.length}개 원고 준비됨
              </p>
              <Button
                variant="danger"
                size="xs"
                onClick={handleClear}
              >
                초기화
              </Button>
            </>
          )}
        </div>

        {parseError && (
          <p className={cn('text-sm text-(--danger)')}>{parseError}</p>
        )}

        {manuscripts.length > 0 && (
          <div className={cn('space-y-2')}>
            <p className={cn('text-sm font-medium text-(--ink)')}>
              원고 목록 ({manuscripts.length}개)
            </p>
            <div className={cn('max-h-52 overflow-y-auto space-y-2')}>
              {Object.entries(groupedByCategory).map(([category, items]) => (
                <div key={category} className={cn('rounded-xl bg-(--surface-muted) p-3')}>
                  <p className={cn('text-xs font-medium text-(--accent) mb-2')}>
                    {category} ({items.length}개)
                  </p>
                  <div className={cn('flex flex-wrap gap-1.5')}>
                    {items.map((m, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs',
                          'bg-(--surface) border border-(--border-light) text-(--ink)'
                        )}
                      >
                        {m.name}
                        {m.images.length > 0 && (
                          <span className={cn('text-(--ink-muted)')}>
                            🖼️{m.images.length}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'modify' && (
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface) p-4 space-y-4')}>
            <p className={cn('text-sm font-medium text-(--ink)')}>수정 옵션</p>
            <div className={cn('grid grid-cols-2 gap-4')}>
              <Select
                label="정렬 순서"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as ManuscriptSortOrder)}
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
                  value={daysLimit}
                  onChange={(e) => setDaysLimit(Number(e.target.value))}
                  min={0}
                  className={inputClassName}
                  placeholder="0 = 전체"
                />
              </div>
            </div>
            <p className={helperClassName}>
              발행된 글 중 {daysLimit > 0 ? `${daysLimit}일 이내` : '전체'}에서 {sortOrder === 'oldest' ? '오래된' : sortOrder === 'newest' ? '최신' : '랜덤'} 순으로 {manuscripts.length}개 선택
            </p>
          </div>
        )}

        {mode === 'publish' && (
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-4')}>
            <PostOptionsUI options={postOptions} onChange={setPostOptions} />
          </div>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={manuscripts.length === 0}
        isLoading={isPending}
        size="lg"
        fullWidth
      >
        {`${manuscripts.length}개 원고 ${mode === 'publish' ? '발행' : '수정'}`}
      </Button>

      {result && (
        <div
          className={cn(
            'rounded-2xl border p-5',
            result.success
              ? 'border-(--success)/30 bg-(--success-soft)'
              : 'border-(--danger)/30 bg-(--danger-soft)'
          )}
        >
          <div className={cn('flex items-center justify-between mb-3')}>
            <h3
              className={cn(
                'font-semibold',
                result.success ? 'text-(--success)' : 'text-(--danger)'
              )}
            >
              {result.success
                ? (mode === 'publish' ? '큐에 추가됨' : '수정 완료')
                : '실패'}
            </h3>
            <span className={cn('text-sm text-(--ink-muted)')}>
              {'jobsAdded' in result ? `${result.jobsAdded}개 작업` : `${result.completed}/${result.totalArticles}개 완료`}
            </span>
          </div>
          <p className={cn('text-sm text-(--ink-muted)')}>{result.message}</p>
        </div>
      )}
    </div>
  );
};
