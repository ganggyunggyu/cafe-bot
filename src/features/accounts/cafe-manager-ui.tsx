'use client';

import { useState, useEffect, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  getCafesAction,
  addCafeAction,
  updateCafeAction,
  deleteCafeAction,
  CafeInput,
} from './actions';

interface CafeData {
  cafeId: string;
  cafeUrl: string;
  menuId: string;
  name: string;
  categories: string[];
  categoryMenuIds?: Record<string, string>;
  isDefault?: boolean;
  fromConfig?: boolean;
}

interface CafeFormData {
  cafeId: string;
  cafeUrl: string;
  menuId: string;
  name: string;
  categories: string;
  categoryMenuIds: string;
  isDefault: boolean;
}

const INITIAL_FORM: CafeFormData = {
  cafeId: '',
  cafeUrl: '',
  menuId: '1',
  name: '',
  categories: '',
  categoryMenuIds: '',
  isDefault: false,
};

// categoryMenuIds 파싱 (문자열 → 객체)
const parseCategoryMenuIds = (str: string): Record<string, string> => {
  if (!str.trim()) return {};
  const result: Record<string, string> = {};
  str.split(',').forEach((pair) => {
    const [cat, menuId] = pair.split(':').map((s) => s.trim());
    if (cat && menuId) {
      result[cat] = menuId;
    }
  });
  return result;
};

// categoryMenuIds 직렬화 (객체 → 문자열)
const serializeCategoryMenuIds = (obj?: Record<string, string>): string => {
  if (!obj) return '';
  return Object.entries(obj)
    .map(([cat, menuId]) => `${cat}:${menuId}`)
    .join(', ');
};

export const CafeManagerUI = () => {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useState<CafeData[]>([]);
  const [form, setForm] = useState<CafeFormData>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadCafes = async () => {
    try {
      const data = await getCafesAction();
      setCafes(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCafes();
  }, []);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const openEditForm = (cafe: CafeData) => {
    setForm({
      cafeId: cafe.cafeId,
      cafeUrl: cafe.cafeUrl,
      menuId: cafe.menuId,
      name: cafe.name,
      categories: cafe.categories.join('\n'),
      categoryMenuIds: serializeCategoryMenuIds(cafe.categoryMenuIds),
      isDefault: cafe.isDefault ?? false,
    });
    setEditingId(cafe.cafeId);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.cafeId || !form.cafeUrl || !form.name) {
      alert('카페ID, 카페URL, 이름은 필수입니다');
      return;
    }

    const input: CafeInput = {
      cafeId: form.cafeId,
      cafeUrl: form.cafeUrl,
      menuId: form.menuId || '1',
      name: form.name,
      categories: form.categories.split('\n').map((s) => s.trim()).filter(Boolean),
      categoryMenuIds: parseCategoryMenuIds(form.categoryMenuIds),
      isDefault: form.isDefault,
    };

    startTransition(async () => {
      if (editingId) {
        await updateCafeAction(editingId, input);
      } else {
        const result = await addCafeAction(input);
        if (!result.success) {
          alert(result.error);
          return;
        }
      }
      resetForm();
      loadCafes();
    });
  };

  const handleDelete = (cafeId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    startTransition(async () => {
      await deleteCafeAction(cafeId);
      loadCafes();
    });
  };

  if (isLoading) {
    return <div className={cn('p-4 text-center text-(--ink-muted)')}>로딩 중...</div>;
  }

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('flex justify-between items-center')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>카페 관리</h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-lg',
              'bg-(--accent) text-white hover:opacity-90 transition'
            )}
          >
            카페 추가
          </button>
        )}
      </div>

      {/* 폼 */}
      {showForm && (
        <div className={cn('p-4 rounded-xl border border-(--border) bg-white/50 space-y-3')}>
          <div className={cn('text-sm font-medium text-(--ink)')}>
            {editingId ? '카페 수정' : '새 카페 추가'}
          </div>

          <div className={cn('grid grid-cols-2 gap-3')}>
            <div className={cn('space-y-1')}>
              <label className={cn('text-xs text-(--ink-muted)')}>카페 ID *</label>
              <input
                type="text"
                value={form.cafeId}
                onChange={(e) => setForm({ ...form, cafeId: e.target.value })}
                disabled={!!editingId}
                className={cn(
                  'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm',
                  editingId && 'bg-gray-100 cursor-not-allowed'
                )}
                placeholder="31640041"
              />
            </div>

            <div className={cn('space-y-1')}>
              <label className={cn('text-xs text-(--ink-muted)')}>카페 URL *</label>
              <input
                type="text"
                value={form.cafeUrl}
                onChange={(e) => setForm({ ...form, cafeUrl: e.target.value })}
                className={cn(
                  'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
                )}
                placeholder="usshdd"
              />
              <p className={cn('text-xs text-(--ink-muted)')}>
                cafe.naver.com/ 뒤에 오는 값
              </p>
            </div>
          </div>

          <div className={cn('space-y-1')}>
            <label className={cn('text-xs text-(--ink-muted)')}>기본 메뉴 ID</label>
            <input
              type="text"
              value={form.menuId}
              onChange={(e) => setForm({ ...form, menuId: e.target.value })}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
              )}
              placeholder="1"
            />
          </div>

          <div className={cn('space-y-1')}>
            <label className={cn('text-xs text-(--ink-muted)')}>카페 이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
              )}
              placeholder="테스트 카페"
            />
          </div>

          <div className={cn('space-y-1')}>
            <label className={cn('text-xs text-(--ink-muted)')}>
              카테고리 (줄바꿈으로 구분)
            </label>
            <textarea
              value={form.categories}
              onChange={(e) => setForm({ ...form, categories: e.target.value })}
              rows={4}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm resize-none'
              )}
              placeholder={'자유게시판\n일상\n정보'}
            />
          </div>

          <div className={cn('space-y-1')}>
            <label className={cn('text-xs text-(--ink-muted)')}>
              카테고리별 메뉴ID (카테고리:메뉴ID, ...)
            </label>
            <input
              type="text"
              value={form.categoryMenuIds}
              onChange={(e) => setForm({ ...form, categoryMenuIds: e.target.value })}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
              )}
              placeholder="자유게시판:1, 일상:2, 정보:3"
            />
            <p className={cn('text-xs text-(--ink-muted)')}>
              각 카테고리별로 다른 메뉴ID를 지정하고 싶을 때 사용
            </p>
          </div>

          <div className={cn('flex items-center gap-2')}>
            <input
              type="checkbox"
              id="isDefault"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className={cn('rounded')}
            />
            <label htmlFor="isDefault" className={cn('text-sm text-(--ink)')}>
              기본 카페로 설정
            </label>
          </div>

          <div className={cn('flex gap-2')}>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className={cn(
                'flex-1 rounded-xl py-2.5 text-sm font-medium transition',
                'bg-(--accent) text-white hover:opacity-90',
                isPending && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isPending ? '저장 중...' : editingId ? '수정' : '추가'}
            </button>
            <button
              onClick={resetForm}
              disabled={isPending}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm font-medium border border-(--border)',
                'hover:bg-gray-50 transition'
              )}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className={cn('space-y-2')}>
        {cafes.length === 0 ? (
          <div className={cn('p-4 text-center text-(--ink-muted) text-sm')}>
            등록된 카페가 없습니다
          </div>
        ) : (
          cafes.map((cafe) => (
            <div
              key={cafe.cafeId}
              className={cn(
                'p-3 rounded-xl border border-(--border) bg-white/50',
                'flex flex-col gap-2'
              )}
            >
              <div className={cn('flex justify-between items-start')}>
                <div>
                  <div className={cn('flex items-center gap-2')}>
                    <span className={cn('font-medium text-(--ink)')}>{cafe.name}</span>
                    {cafe.isDefault && (
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          'bg-(--accent)/10 text-(--accent)'
                        )}
                      >
                        기본
                      </span>
                    )}
                    {cafe.fromConfig && (
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          'bg-gray-200 text-gray-600'
                        )}
                      >
                        config
                      </span>
                    )}
                  </div>
                  <div className={cn('text-xs text-(--ink-muted) mt-0.5')}>
                    ID: {cafe.cafeId} | URL: {cafe.cafeUrl} | 메뉴: {cafe.menuId}
                  </div>
                </div>
                <div className={cn('flex gap-1')}>
                  <button
                    onClick={() => openEditForm(cafe)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-lg',
                      'border border-(--border) hover:bg-gray-50 transition'
                    )}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(cafe.cafeId)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-lg',
                      'border border-red-200 text-red-500 hover:bg-red-50 transition'
                    )}
                  >
                    삭제
                  </button>
                </div>
              </div>

              {/* 카테고리 표시 */}
              {cafe.categories.length > 0 && (
                <div className={cn('flex flex-wrap gap-1')}>
                  {cafe.categories.map((cat) => {
                    const menuId = cafe.categoryMenuIds?.[cat];
                    return (
                      <span
                        key={cat}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          'bg-gray-100 text-gray-600'
                        )}
                      >
                        {cat}
                        {menuId && <span className={cn('text-gray-400')}> ({menuId})</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
