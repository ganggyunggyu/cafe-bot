'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  getCafesAction,
  addCafeAction,
  deleteCafeAction,
  updateCafeAction,
} from './actions';

interface CafeData {
  cafeId: string;
  menuId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
  fromConfig?: boolean;
}

export function CafeManagerUI() {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useState<CafeData[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCafe, setNewCafe] = useState({ cafeId: '', menuId: '1', name: '', categories: '' });

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );

  const loadCafes = () => {
    startTransition(async () => {
      const data = await getCafesAction();
      setCafes(data);
    });
  };

  useEffect(() => {
    loadCafes();
  }, []);

  const handleAdd = () => {
    if (!newCafe.cafeId || !newCafe.name) {
      setMessage({ type: 'error', text: '카페 ID와 이름을 입력해' });
      return;
    }

    startTransition(async () => {
      const result = await addCafeAction({
        cafeId: newCafe.cafeId,
        menuId: newCafe.menuId || '1',
        name: newCafe.name,
        categories: newCafe.categories.split(',').map((c) => c.trim()).filter(Boolean),
      });

      if (result.success) {
        setMessage({ type: 'success', text: '카페 추가 완료' });
        setNewCafe({ cafeId: '', menuId: '1', name: '', categories: '' });
        setShowAddForm(false);
        loadCafes();
      } else {
        setMessage({ type: 'error', text: result.error || '추가 실패' });
      }
    });
  };

  const handleDelete = (cafeId: string, name: string) => {
    if (!confirm(`"${name}" 카페를 삭제할까?`)) return;

    startTransition(async () => {
      await deleteCafeAction(cafeId);
      setMessage({ type: 'success', text: `${name} 삭제 완료` });
      loadCafes();
    });
  };

  const handleSetDefault = (cafeId: string) => {
    startTransition(async () => {
      await updateCafeAction(cafeId, { isDefault: true });
      setMessage({ type: 'success', text: '기본 카페 설정 완료' });
      loadCafes();
    });
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-2')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>Cafes</p>
        <div className={cn('flex items-center justify-between')}>
          <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
            등록된 카페 ({cafes.length}개)
          </h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition',
              'bg-(--teal) text-white hover:brightness-105'
            )}
          >
            {showAddForm ? '취소' : '+ 추가'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-xl border px-3 py-2 text-sm',
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          )}
        >
          {message.text}
        </div>
      )}

      {showAddForm && (
        <div className={cn('rounded-xl border border-(--border) bg-white/50 p-4 space-y-3')}>
          <input
            type="text"
            placeholder="카페 ID (숫자)"
            value={newCafe.cafeId}
            onChange={(e) => setNewCafe((p) => ({ ...p, cafeId: e.target.value }))}
            className={inputClassName}
          />
          <input
            type="text"
            placeholder="메뉴 ID (기본: 1)"
            value={newCafe.menuId}
            onChange={(e) => setNewCafe((p) => ({ ...p, menuId: e.target.value }))}
            className={inputClassName}
          />
          <input
            type="text"
            placeholder="카페 이름"
            value={newCafe.name}
            onChange={(e) => setNewCafe((p) => ({ ...p, name: e.target.value }))}
            className={inputClassName}
          />
          <input
            type="text"
            placeholder="카테고리 (쉼표로 구분)"
            value={newCafe.categories}
            onChange={(e) => setNewCafe((p) => ({ ...p, categories: e.target.value }))}
            className={inputClassName}
          />
          <p className={cn('text-xs text-(--ink-muted)')}>
            카페 ID는 카페 URL에서 확인: cafe.naver.com/ca-fe/cafes/<strong>31640041</strong>/...
          </p>
          <button
            onClick={handleAdd}
            disabled={isPending}
            className={cn(
              'w-full rounded-xl px-4 py-2 text-sm font-semibold text-white transition',
              'bg-(--teal) hover:brightness-105',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
          >
            카페 추가
          </button>
        </div>
      )}

      {cafes.length === 0 ? (
        <div className={cn('rounded-xl border border-(--border) bg-white/50 p-6 text-center')}>
          <p className={cn('text-sm text-(--ink-muted)')}>
            등록된 카페가 없어. "+ 추가" 버튼을 눌러봐.
          </p>
        </div>
      ) : (
        <ul className={cn('space-y-2')}>
          {cafes.map((cafe) => (
            <li
              key={cafe.cafeId}
              className={cn(
                'rounded-xl border border-(--border) bg-white/70 px-4 py-3'
              )}
            >
              <div className={cn('flex items-center justify-between gap-3')}>
                <div className={cn('flex-1')}>
                  <div className={cn('flex items-center gap-2')}>
                    <span className={cn('text-sm font-semibold text-(--ink)')}>{cafe.name}</span>
                    {cafe.isDefault && (
                      <span className={cn('text-xs bg-(--teal-soft) text-(--teal) px-1.5 py-0.5 rounded')}>
                        기본
                      </span>
                    )}
                    {cafe.fromConfig && (
                      <span className={cn('text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded')}>
                        설정파일
                      </span>
                    )}
                  </div>
                  <p className={cn('text-xs text-(--ink-muted)')}>
                    ID: {cafe.cafeId} | 메뉴: {cafe.menuId}
                  </p>
                  {cafe.categories.length > 0 && (
                    <div className={cn('flex flex-wrap gap-1 mt-1')}>
                      {cafe.categories.slice(0, 5).map((cat) => (
                        <span
                          key={cat}
                          className={cn('text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded')}
                        >
                          {cat}
                        </span>
                      ))}
                      {cafe.categories.length > 5 && (
                        <span className={cn('text-xs text-gray-400')}>
                          +{cafe.categories.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className={cn('flex gap-2')}>
                  {!cafe.isDefault && !cafe.fromConfig && (
                    <button
                      onClick={() => handleSetDefault(cafe.cafeId)}
                      disabled={isPending}
                      className={cn(
                        'rounded-full px-2 py-1 text-xs font-medium transition',
                        'border border-(--teal) text-(--teal) hover:bg-(--teal-soft)',
                        'disabled:cursor-not-allowed disabled:opacity-60'
                      )}
                    >
                      기본설정
                    </button>
                  )}
                  {!cafe.fromConfig && (
                    <button
                      onClick={() => handleDelete(cafe.cafeId, cafe.name)}
                      disabled={isPending}
                      className={cn(
                        'rounded-full px-2 py-1 text-xs font-medium transition',
                        'border border-red-300 text-red-600 hover:bg-red-50',
                        'disabled:cursor-not-allowed disabled:opacity-60'
                      )}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
