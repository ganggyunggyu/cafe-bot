import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), '.cafe-bot-data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

// 활동 시간대 설정
export interface ActivityHours {
  start: number; // 시작 시간 (0-23)
  end: number; // 종료 시간 (0-23)
}

// 페르소나 카테고리
export type PersonaCategory =
  | 'positive' // 0~4: 긍정적 반응
  | 'neutral' // 5~17: 중립적 반응
  | 'cynical' // 18~23: 냉소/시니컬
  | 'critical' // 24~27: 질문/비판
  | 'ad_skeptic' // 28~32: 광고의심
  | 'community' // 33~43: 커뮤니티별
  | 'mom_cafe' // 44~49: 맘카페/여성커뮤
  | 'interest' // 50~57: 관심사별
  | 'age_group' // 58~64: 연령대별
  | 'lifestyle' // 65~72: 생활상황별
  | 'style' // 73~79: 반응유형/특수/말투
  | 'random'; // null: 랜덤

export interface NaverAccount {
  id: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  // 활동 설정
  activityHours?: ActivityHours; // 활동 시간대 (미설정 시 24시간)
  restDays?: number[]; // 휴식 요일 (0=일요일, 6=토요일)
  dailyPostLimit?: number; // 하루 글 발행 제한 (미설정 시 무제한)
  // 페르소나 설정
  personaIndex?: number; // 고정 페르소나 (0~79, 미설정 시 랜덤)
  personaCategory?: PersonaCategory; // 페르소나 카테고리 (해당 범위 내 랜덤)
}

export interface AccountList {
  accounts: NaverAccount[];
}

const ensureDataDir = (): void => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export const getAccounts = (): NaverAccount[] => {
  ensureDataDir();

  if (!existsSync(ACCOUNTS_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(ACCOUNTS_FILE, 'utf-8');
    const parsed: AccountList = JSON.parse(data);
    return parsed.accounts || [];
  } catch {
    return [];
  }
}

export const saveAccounts = (accounts: NaverAccount[]): void => {
  ensureDataDir();

  const data: AccountList = { accounts };
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

export const addAccount = (account: NaverAccount): NaverAccount[] => {
  const accounts = getAccounts();
  const existing = accounts.findIndex((a) => a.id === account.id);

  if (existing >= 0) {
    accounts[existing] = account;
  } else {
    accounts.push(account);
  }

  saveAccounts(accounts);
  return accounts;
}

export const removeAccount = (id: string): NaverAccount[] => {
  const accounts = getAccounts().filter((a) => a.id !== id);
  saveAccounts(accounts);
  return accounts;
}

export const setMainAccount = (id: string): NaverAccount[] => {
  const accounts = getAccounts().map((a) => ({
    ...a,
    isMain: a.id === id,
  }));
  saveAccounts(accounts);
  return accounts;
}

export const getMainAccount = (): NaverAccount | undefined => {
  return getAccounts().find((a) => a.isMain);
}

export const getCommentAccounts = (): NaverAccount[] => {
  return getAccounts().filter((a) => !a.isMain);
};

// 페르소나 카테고리 → 인덱스 범위
const PERSONA_RANGES: Record<PersonaCategory, [number, number] | null> = {
  positive: [0, 4],
  neutral: [5, 17],
  cynical: [18, 23],
  critical: [24, 27],
  ad_skeptic: [28, 32],
  community: [33, 43],
  mom_cafe: [44, 49],
  interest: [50, 57],
  age_group: [58, 64],
  lifestyle: [65, 72],
  style: [73, 79],
  random: null,
};

// 계정의 페르소나 인덱스 가져오기 (고정 또는 카테고리 범위 내 랜덤)
export const getPersonaIndex = (account: NaverAccount): number | null => {
  // 고정 페르소나가 있으면 사용
  if (account.personaIndex !== undefined) {
    return account.personaIndex;
  }

  // 카테고리가 있으면 해당 범위 내 랜덤
  if (account.personaCategory && account.personaCategory !== 'random') {
    const range = PERSONA_RANGES[account.personaCategory];
    if (range) {
      const [min, max] = range;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }

  // 그 외에는 null (API에서 랜덤 처리)
  return null;
};

// 계정이 현재 활동 가능한지 확인
export const isAccountActive = (account: NaverAccount): boolean => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0=일요일

  // 휴식 요일 체크
  if (account.restDays?.includes(currentDay)) {
    return false;
  }

  // 활동 시간대 체크
  if (account.activityHours) {
    const { start, end } = account.activityHours;

    // 자정을 넘는 경우 (예: 22시~6시)
    if (start > end) {
      return currentHour >= start || currentHour < end;
    }

    // 일반적인 경우 (예: 9시~22시)
    return currentHour >= start && currentHour < end;
  }

  return true; // 설정 없으면 항상 활동 가능
};

// 활동 가능한 계정만 필터링
export const getActiveAccounts = (): NaverAccount[] => {
  return getAccounts().filter(isAccountActive);
};
