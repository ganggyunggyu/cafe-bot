'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select, Button, Checkbox } from '@/shared/ui';
import {
  getAccountsAction,
  addAccountAction,
  updateAccountAction,
  deleteAccountAction,
  migrateFromConfigAction,
  type AccountData,
  type AccountInput,
} from './actions';
import { loginAccountAction } from '../auto-comment/actions';

const PERSONA_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: '랜덤' },
  { id: 'cute_f', label: '친근 발랄 (20대 여성)' },
  { id: 'warm_f', label: '따뜻한 30대 여성' },
  { id: 'enthusiast', label: '열정파' },
  { id: 'grateful', label: '감사 표현형' },
  { id: 'supporter', label: '응원형' },
  { id: 'chill_m', label: '무심 20대 남성' },
  { id: 'dry', label: '담백함' },
  { id: 'quiet', label: '조용한 단답' },
  { id: 'observer', label: '관찰자' },
  { id: 'practical_m', label: '실용적 30대 남성' },
  { id: 'curious', label: '궁금 질문형' },
  { id: 'similar', label: '공감형' },
  { id: 'info_seeker', label: '정보 탐색형' },
  { id: 'passerby', label: '그냥 지나감' },
  { id: 'cynical', label: '시니컬' },
  { id: 'skeptic', label: '의심 많음' },
  { id: 'sarcastic', label: '은근 비꼼' },
  { id: 'tired', label: '지침/무기력' },
  { id: 'been_there', label: '다 해봄' },
  { id: 'realistic', label: '현실적 우려' },
  { id: 'critic', label: '살짝 까는 편' },
  { id: 'doubter', label: '반신반의' },
  { id: 'contrarian', label: '반대 의견' },
  { id: 'nitpicker', label: '디테일 지적' },
  { id: 'ad_detector', label: '광고 감별사' },
  { id: 'ad_skeptic', label: '홍보 의심' },
  { id: 'ad_tired', label: '광고 피로' },
  { id: 'ad_direct', label: '직설형' },
  { id: 'ad_compare', label: '비교형 대안 제시' },
  { id: 'dc_style', label: '디시 스타일' },
  { id: 'fm_style', label: '에펨 스타일' },
  { id: 'naver_cafe', label: '네카페 스타일' },
  { id: 'twitter', label: '트위터 스타일' },
  { id: 'insta', label: '인스타 스타일' },
  { id: 'blind', label: '블라인드 스타일' },
  { id: 'clien', label: '클리앙 스타일' },
  { id: 'ruriweb', label: '루리웹 스타일' },
  { id: 'theqoo', label: '더쿠 스타일' },
  { id: 'ohouse', label: '오늘의집 스타일' },
  { id: 'ppomppu', label: '뽐뿌 스타일' },
  { id: 'mom_cafe', label: '맘카페 스타일' },
  { id: 'mom_senior', label: '선배맘' },
  { id: 'mom_newbie', label: '초보맘' },
  { id: 'mom_working', label: '워킹맘' },
  { id: 'beauty_cafe', label: '뷰티카페' },
  { id: 'diet_cafe', label: '다이어트카페' },
  { id: 'realestate', label: '부동산카페' },
  { id: 'car_cafe', label: '자동차카페' },
  { id: 'travel_cafe', label: '여행카페' },
  { id: 'food_cafe', label: '맛집카페' },
  { id: 'pet_cafe', label: '반려동물카페' },
  { id: 'stock_cafe', label: '재테크카페' },
  { id: 'hobby_outdoor', label: '아웃도어' },
  { id: 'hobby_fitness', label: '헬스/운동' },
  { id: 'teen', label: '10대' },
  { id: '20s_m', label: '20대 남성' },
  { id: '20s_f', label: '20대 여성' },
  { id: '30s', label: '30대' },
  { id: '40s', label: '40대' },
  { id: '50s', label: '50대 이상' },
  { id: 'newlywed', label: '신혼부부' },
  { id: 'pregnant', label: '예비맘' },
  { id: 'office_worker', label: '직장인' },
  { id: 'self_employed', label: '자영업' },
  { id: 'freelancer', label: '프리랜서' },
  { id: 'student', label: '대학생' },
  { id: 'single_life', label: '자취생' },
  { id: 'retiree', label: '은퇴자' },
  { id: 'tmi', label: 'TMI형' },
  { id: 'advisor', label: '조언형' },
  { id: 'reviewer', label: '후기형' },
  { id: 'bookmark', label: '북마크형' },
  { id: 'jealous', label: '부러움' },
  { id: 'empathy', label: '공감형' },
  { id: 'random', label: '뜬금없음' },
  { id: 'expert', label: '경험 많음' },
  { id: 'beginner', label: '초보' },
  { id: 'local', label: '근처 거주' },
  { id: 'competitor', label: '비교형' },
  { id: 'lurker', label: '눈팅러' },
  { id: 'formal', label: '격식체' },
  { id: 'casual', label: '반말' },
  { id: 'mixed', label: '존반 섞어씀' },
  { id: 'emoji_user', label: '이모지 많이' },
  { id: 'no_emoji', label: '이모지 안 씀' },
  { id: 'short', label: '극단적 짧음' },
  { id: 'long', label: '길게 상세함' },
];

const DAYS = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
];

interface AccountFormData {
  id: string;
  password: string;
  nickname: string;
  isMain: boolean;
  activityStart: string;
  activityEnd: string;
  restDays: number[];
  dailyPostLimit: string;
  personaId: string;
}

const defaultFormData: AccountFormData = {
  id: '',
  password: '',
  nickname: '',
  isMain: false,
  activityStart: '9',
  activityEnd: '22',
  restDays: [],
  dailyPostLimit: '5',
  personaId: '',
};

export const AccountManagerUI = () => {
  const [isPending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loginStatus, setLoginStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(defaultFormData);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');

  const loadAccounts = () => {
    startTransition(async () => {
      const data = await getAccountsAction();
      setAccounts(data);
    });
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleMigrate = () => {
    startTransition(async () => {
      const result = await migrateFromConfigAction();
      if (result.success) {
        setMessage({ type: 'success', text: `마이그레이션 완료: 계정 ${result.accountsAdded}개, 카페 ${result.cafesAdded}개 추가` });
        loadAccounts();
      }
    });
  };

  const openAddForm = () => {
    setFormData(defaultFormData);
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (account: AccountData) => {
    setFormData({
      id: account.id,
      password: account.password,
      nickname: account.nickname || '',
      isMain: account.isMain || false,
      activityStart: account.activityHours?.start?.toString() || '9',
      activityEnd: account.activityHours?.end?.toString() || '22',
      restDays: account.restDays || [],
      dailyPostLimit: account.dailyPostLimit?.toString() || '5',
      personaId: account.personaId || '',
    });
    setEditingId(account.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.id || !formData.password) {
      setMessage({ type: 'error', text: '아이디와 비밀번호를 입력해주세요' });
      return;
    }

    const input: AccountInput = {
      accountId: formData.id,
      password: formData.password,
      nickname: formData.nickname || undefined,
      isMain: formData.isMain,
      activityHours: {
        start: parseInt(formData.activityStart) || 9,
        end: parseInt(formData.activityEnd) || 22,
      },
      restDays: formData.restDays,
      dailyPostLimit: parseInt(formData.dailyPostLimit) || undefined,
      personaId: formData.personaId,
    };

    startTransition(async () => {
      if (editingId) {
        await updateAccountAction(editingId, input);
        setMessage({ type: 'success', text: '계정 수정 완료' });
      } else {
        const result = await addAccountAction(input);
        if (result.success) {
          setMessage({ type: 'success', text: '계정 추가 완료' });
        } else {
          setMessage({ type: 'error', text: result.error || '추가 실패' });
          return;
        }
      }
      setShowForm(false);
      setFormData(defaultFormData);
      setEditingId(null);
      loadAccounts();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(`${id} 계정을 삭제하시겠습니까?`)) return;

    startTransition(async () => {
      const result = await deleteAccountAction(id);
      if (result.success) {
        setMessage({ type: 'success', text: `${id} 삭제 완료` });
      } else {
        setMessage({ type: 'error', text: result.error || '삭제 실패' });
      }
      loadAccounts();
    });
  };

  const handleLogin = (id: string, password: string) => {
    setLoginStatus((prev) => ({ ...prev, [id]: 'loading' }));

    startTransition(async () => {
      const result = await loginAccountAction(id, password);
      setLoginStatus((prev) => ({
        ...prev,
        [id]: result.success ? 'success' : 'error',
      }));
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.success ? `${id} 로그인 성공` : result.error || '로그인 실패',
      });
    });
  };

  const toggleRestDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      restDays: prev.restDays.includes(day)
        ? prev.restDays.filter((d) => d !== day)
        : [...prev.restDays, day],
    }));
  };

  const getStatusBadge = (id: string) => {
    const status = loginStatus[id];
    if (status === 'loading') return <span className={cn('text-xs text-(--info)')}>로그인 중...</span>;
    if (status === 'success') return <span className={cn('text-xs text-(--success)')}>로그인됨</span>;
    if (status === 'error') return <span className={cn('text-xs text-(--danger)')}>실패</span>;
    return <span className={cn('text-xs text-(--ink-tertiary)')}>대기</span>;
  };

  const getActivityInfo = (account: AccountData) => {
    const parts: string[] = [];
    if (account.activityHours) {
      parts.push(`${account.activityHours.start}시~${account.activityHours.end}시`);
    }
    if (account.restDays && account.restDays.length > 0) {
      const dayNames = account.restDays.map((d) => DAYS.find((day) => day.value === d)?.label).join('');
      parts.push(`휴식: ${dayNames}`);
    }
    if (account.dailyPostLimit) {
      parts.push(`일${account.dailyPostLimit}개`);
    }
    return parts.length > 0 ? parts.join(' · ') : '24시간 활동';
  };

  return (
    <div className={cn('space-y-6')}>
      {/* 헤더 */}
      <div className={cn('flex items-center justify-between')}>
        <div>
          <h2 className={cn('text-xl font-bold text-(--ink)')}>
            등록된 계정
          </h2>
          <p className={cn('text-sm text-(--ink-muted) mt-1')}>{accounts.length}개 계정</p>
        </div>
        <div className={cn('flex gap-2')}>
          <Button
            variant="secondary"
            onClick={handleMigrate}
            disabled={isPending}
          >
            설정 가져오기
          </Button>
          <Button onClick={openAddForm}>
            계정 추가
          </Button>
        </div>
      </div>

      {/* 메시지 */}
      {message && (
        <div
          className={cn(
            'rounded-xl border p-4 text-sm',
            message.type === 'success'
              ? 'border-(--success)/20 bg-(--success-soft) text-(--success)'
              : 'border-(--danger)/20 bg-(--danger-soft) text-(--danger)'
          )}
        >
          {message.text}
        </div>
      )}

      {/* 계정 추가/편집 폼 */}
      {showForm && (
        <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-5')}>
          <div className={cn('flex items-center justify-between')}>
            <h3 className={cn('text-base font-semibold text-(--ink)')}>
              {editingId ? '계정 수정' : '새 계정 추가'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              취소
            </Button>
          </div>

          {/* 기본 정보 */}
          <div className={cn('grid gap-4 md:grid-cols-3')}>
            <div className={cn('space-y-2')}>
              <label className={labelClassName}>네이버 아이디</label>
              <input
                type="text"
                placeholder="아이디"
                value={formData.id}
                onChange={(e) => setFormData((p) => ({ ...p, id: e.target.value }))}
                disabled={!!editingId}
                className={cn(inputClassName, editingId && 'bg-(--surface-muted)')}
              />
            </div>
            <div className={cn('space-y-2')}>
              <label className={labelClassName}>비밀번호</label>
              <input
                type="password"
                placeholder="비밀번호"
                value={formData.password}
                onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                className={inputClassName}
              />
            </div>
            <div className={cn('space-y-2')}>
              <label className={labelClassName}>닉네임 (선택)</label>
              <input
                type="text"
                placeholder="닉네임"
                value={formData.nickname}
                onChange={(e) => setFormData((p) => ({ ...p, nickname: e.target.value }))}
                className={inputClassName}
              />
            </div>
          </div>

          {/* 활동 시간 */}
          <div className={cn('space-y-2')}>
            <label className={labelClassName}>활동 시간대</label>
            <div className={cn('flex items-center gap-3')}>
              <input
                type="text"
                inputMode="numeric"
                value={formData.activityStart}
                onChange={(e) => setFormData((p) => ({ ...p, activityStart: e.target.value.replace(/\D/g, '') }))}
                className={cn(inputClassName, 'w-20 text-center')}
              />
              <span className={cn('text-sm text-(--ink-muted)')}>시 ~</span>
              <input
                type="text"
                inputMode="numeric"
                value={formData.activityEnd}
                onChange={(e) => setFormData((p) => ({ ...p, activityEnd: e.target.value.replace(/\D/g, '') }))}
                className={cn(inputClassName, 'w-20 text-center')}
              />
              <span className={cn('text-sm text-(--ink-muted)')}>시</span>
            </div>
          </div>

          {/* 휴식 요일 */}
          <div className={cn('space-y-2')}>
            <label className={labelClassName}>휴식 요일</label>
            <div className={cn('flex gap-2')}>
              {DAYS.map((day) => (
                <Button
                  key={day.value}
                  type="button"
                  variant={formData.restDays.includes(day.value) ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => toggleRestDay(day.value)}
                  className="w-10 h-10"
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 일일 제한 & 페르소나 */}
          <div className={cn('grid gap-4 md:grid-cols-2')}>
            <div className={cn('space-y-2')}>
              <label className={labelClassName}>일일 글 제한</label>
              <input
                type="text"
                inputMode="numeric"
                value={formData.dailyPostLimit}
                onChange={(e) => setFormData((p) => ({ ...p, dailyPostLimit: e.target.value.replace(/\D/g, '') }))}
                className={inputClassName}
              />
            </div>
            <Select
              label="페르소나"
              value={formData.personaId}
              onChange={(e) => setFormData((p) => ({ ...p, personaId: e.target.value }))}
              options={PERSONA_OPTIONS.map((opt) => ({
                value: opt.id,
                label: opt.label,
              }))}
            />
          </div>

          {/* 메인 계정 */}
          <Checkbox
            label="메인 계정으로 설정"
            checked={formData.isMain}
            onChange={(e) => setFormData((p) => ({ ...p, isMain: e.target.checked }))}
          />

          <Button
            onClick={handleSubmit}
            disabled={isPending}
            size="lg"
            fullWidth
          >
            {editingId ? '수정' : '추가'}
          </Button>
        </div>
      )}

      {/* 계정 목록 */}
      {accounts.length === 0 ? (
        <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-8 text-center')}>
          <p className={cn('text-sm text-(--ink-muted)')}>
            등록된 계정이 없습니다. "설정 가져오기" 또는 "계정 추가" 버튼을 눌러주세요.
          </p>
        </div>
      ) : (
        <ul className={cn('space-y-3')}>
          {accounts.map((account, index) => (
            <li
              key={account.id}
              className={cn(
                'rounded-2xl border border-(--border-light) bg-(--surface) p-5'
              )}
            >
              <div className={cn('flex items-center justify-between gap-4')}>
                <div className={cn('flex items-center gap-4 flex-1 min-w-0')}>
                  <span
                    className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0',
                      account.isMain ? 'bg-(--info-soft) text-(--info)' : 'bg-(--surface-muted) text-(--ink-muted)'
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className={cn('min-w-0')}>
                    <div className={cn('flex items-center gap-2 flex-wrap')}>
                      <span className={cn('text-sm font-semibold text-(--ink)')}>{account.id}</span>
                      {account.nickname && (
                        <span className={cn('text-sm text-(--ink-muted)')}>({account.nickname})</span>
                      )}
                      {account.isMain && (
                        <span className={cn('text-xs bg-(--info-soft) text-(--info) px-2 py-0.5 rounded-md font-medium')}>
                          메인
                        </span>
                      )}
                      {account.personaId && (
                        <span className={cn('text-xs bg-(--surface-muted) text-(--ink-muted) px-2 py-0.5 rounded-md')}>
                          {PERSONA_OPTIONS.find((opt) => opt.id === account.personaId)?.label || account.personaId}
                        </span>
                      )}
                    </div>
                    <div className={cn('flex items-center gap-2 mt-1')}>
                      {getStatusBadge(account.id)}
                      <span className={cn('text-xs text-(--ink-muted)')}>
                        {getActivityInfo(account)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={cn('flex gap-2 shrink-0')}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditForm(account)}
                  >
                    편집
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleLogin(account.id, account.password)}
                    disabled={isPending || loginStatus[account.id] === 'loading'}
                  >
                    테스트
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(account.id)}
                    disabled={isPending}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
