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

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10',
    'disabled:bg-(--surface-muted) disabled:cursor-not-allowed'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');
  const helperClassName = cn('text-xs text-(--ink-muted) mt-1');

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
    return (
      <div className={cn('p-8 text-center text-(--ink-muted)')}>
        로딩 중...
      </div>
    );
  }

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('flex justify-between items-center')}>
        <h3 className={cn('text-lg font-semibold text-(--ink)')}>카페 관리</h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-xl transition-all',
              'bg-(--accent) text-white hover:bg-(--accent-hover)'
            )}
          >
            카페 추가
          </button>
        )}
      </div>

      {showForm && (
        <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-5')}>
          <div className={cn('text-base font-semibold text-(--ink)')}>
            {editingId ? '카페 수정' : '새 카페 추가'}
          </div>

          <div className={cn('grid grid-cols-2 gap-4')}>
            <div className={cn('space-y-2')}>
              <label className={labelClassName}>카페 ID *</label>
              <input
                type="text"
                value={form.cafeId}
                onChange={(e) => setForm({ ...form, cafeId: e.target.value })}
                disabled={!!editingId}
                className={inputClassName}
                placeholder="31640041"
              />
            </div>

            <div className={cn('space-y-2')}>
              <label className={labelClassName}>카페 URL *</label>
              <input
                type="text"
                value={form.cafeUrl}
                onChange={(e) => setForm({ ...form, cafeUrl: e.target.value })}
                className={inputClassName}
                placeholder="usshdd"
              />
              <p className={helperClassName}>cafe.naver.com/ 뒤에 오는 값</p>
            </div>
          </div>

          <div className={cn('space-y-2')}>
            <label className={labelClassName}>기본 메뉴 ID</label>
            <input
              type="text"
              value={form.menuId}
              onChange={(e) => setForm({ ...form, menuId: e.target.value })}
              className={inputClassName}
              placeholder="1"
            />
          </div>

          <div className={cn('space-y-2')}>
            <label className={labelClassName}>카페 이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClassName}
              placeholder="테스트 카페"
            />
          </div>

          <div className={cn('space-y-2')}>
            <label className={labelClassName}>카테고리 (줄바꿈으로 구분)</label>
            <textarea
              value={form.categories}
              onChange={(e) => setForm({ ...form, categories: e.target.value })}
              rows={4}
              className={cn(inputClassName, 'resize-none')}
              placeholder={'자유게시판\n일상\n정보'}
            />
          </div>

          <div className={cn('space-y-2')}>
            <label className={labelClassName}>카테고리별 메뉴ID</label>
            <input
              type="text"
              value={form.categoryMenuIds}
              onChange={(e) => setForm({ ...form, categoryMenuIds: e.target.value })}
              className={inputClassName}
              placeholder="자유게시판:1, 일상:2, 정보:3"
            />
            <p className={helperClassName}>
              각 카테고리별로 다른 메뉴ID를 지정하고 싶을 때 사용
            </p>
          </div>

          <label className={cn('flex items-center gap-3 cursor-pointer')}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className={cn(
                'w-5 h-5 rounded border-2 border-(--border)',
                'checked:bg-(--accent) checked:border-(--accent)',
                'focus:ring-2 focus:ring-(--accent)/20'
              )}
            />
            <span className={labelClassName}>기본 카페로 설정</span>
          </label>

          <div className={cn('flex gap-3 pt-2')}>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold transition-all',
                'bg-(--accent) text-white hover:bg-(--accent-hover)',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isPending ? '저장 중...' : editingId ? '수정' : '추가'}
            </button>
            <button
              onClick={resetForm}
              disabled={isPending}
              className={cn(
                'rounded-xl px-6 py-3 text-sm font-medium transition-all',
                'border border-(--border) text-(--ink) hover:bg-(--surface-muted)'
              )}
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className={cn('space-y-3')}>
        {cafes.length === 0 ? (
          <div className={cn('p-8 text-center text-(--ink-muted) text-sm rounded-xl border border-dashed border-(--border)')}>
            등록된 카페가 없습니다
          </div>
        ) : (
          cafes.map((cafe) => (
            <div
              key={cafe.cafeId}
              className={cn(
                'p-4 rounded-xl border border-(--border-light) bg-(--surface)',
                'flex flex-col gap-3 transition-all hover:border-(--border)'
              )}
            >
              <div className={cn('flex justify-between items-start')}>
                <div>
                  <div className={cn('flex items-center gap-2')}>
                    <span className={cn('font-semibold text-(--ink)')}>{cafe.name}</span>
                    {cafe.isDefault && (
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-lg font-medium',
                          'bg-(--accent)/10 text-(--accent)'
                        )}
                      >
                        기본
                      </span>
                    )}
                    {cafe.fromConfig && (
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-lg font-medium',
                          'bg-(--surface-muted) text-(--ink-muted)'
                        )}
                      >
                        config
                      </span>
                    )}
                  </div>
                  <div className={cn('text-xs text-(--ink-muted) mt-1')}>
                    ID: {cafe.cafeId} | URL: {cafe.cafeUrl} | 메뉴: {cafe.menuId}
                  </div>
                </div>
                <div className={cn('flex gap-2')}>
                  <button
                    onClick={() => openEditForm(cafe)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                      'border border-(--border) text-(--ink) hover:bg-(--surface-muted)'
                    )}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(cafe.cafeId)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                      'border border-(--danger)/30 text-(--danger) hover:bg-(--danger-soft)'
                    )}
                  >
                    삭제
                  </button>
                </div>
              </div>

              {cafe.categories.length > 0 && (
                <div className={cn('flex flex-wrap gap-1.5')}>
                  {cafe.categories.map((cat) => {
                    const menuId = cafe.categoryMenuIds?.[cat];
                    return (
                      <span
                        key={cat}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-lg',
                          'bg-(--surface-muted) text-(--ink-secondary)'
                        )}
                      >
                        {cat}
                        {menuId && <span className={cn('text-(--ink-muted)')}> ({menuId})</span>}
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
