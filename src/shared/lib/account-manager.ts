import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), '.cafe-bot-data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

// 활동 시간대 설정
export interface ActivityHours {
  start: number; // 시작 시간 (0-23)
  end: number; // 종료 시간 (0-23)
}

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
  personaId?: string; // 고정 페르소나 ID (미설정 시 랜덤)
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

// 계정의 페르소나 ID 가져오기 (고정 또는 랜덤)
export const getPersonaId = (account: NaverAccount): string | null => {
  // 고정 페르소나가 있으면 사용
  if (account.personaId) {
    return account.personaId;
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

// 다음 활동 시작 시간까지 밀리초 계산
// 현재 활동 중이면 0, 아니면 다음 활동 시작까지 대기 시간 반환
export const getNextActiveTime = (account: NaverAccount): number => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  // 현재 활동 중이면 0
  if (isAccountActive(account)) {
    return 0;
  }

  // 활동 시간 설정이 없으면 0 (항상 활동)
  if (!account.activityHours) {
    return 0;
  }

  const { start, end } = account.activityHours;

  // 다음 활동 시작 시간 계산
  let targetDate = new Date(now);
  targetDate.setMinutes(0, 0, 0); // 정각으로 맞춤

  if (start > end) {
    // 자정 넘는 경우 (예: 22시~6시)
    if (currentHour < end) {
      // 이미 활동 시간 (isAccountActive에서 걸러져야 하지만 안전장치)
      return 0;
    } else if (currentHour < start) {
      // 오늘 start 시간까지 대기
      targetDate.setHours(start);
    } else {
      // 이미 활동 시간
      return 0;
    }
  } else {
    // 일반적인 경우 (예: 10시~21시)
    if (currentHour < start) {
      // 오늘 start 시간까지 대기
      targetDate.setHours(start);
    } else {
      // 오늘 활동 끝남 → 내일 start
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(start);
    }
  }

  // 휴식일 체크 - 휴식일이면 다음 활동일 찾기
  if (account.restDays) {
    while (account.restDays.includes(targetDate.getDay())) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
  }

  return Math.max(0, targetDate.getTime() - now.getTime());
};
