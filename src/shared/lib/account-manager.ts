import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ★★★ 계정 소스 토글 ★★★
// true = 정적 JSON 파일 사용 (src/shared/config/accounts.json)
// false = 동적 파일 사용 (.cafe-bot-data/accounts.json)
const USE_STATIC_ACCOUNTS = false;

const DATA_DIR = join(process.cwd(), '.cafe-bot-data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');
const STATIC_ACCOUNTS_FILE = join(
  process.cwd(),
  'src/shared/config/accounts.json'
);

// MongoDB export 형식 타입
interface MongoExportAccount {
  _id?: { $oid: string };
  accountId: string;
  password: string;
  nickname?: string;
  personaId?: string;
  isMain?: boolean;
  dailyPostLimit?: number;
  activityHours?: { start: number; end: number };
  isActive?: boolean;
  restDays?: number[];
  updatedAt?: { $date: string };
}

export interface ActivityHours {
  start: number;
  end: number;
}

export interface NaverAccount {
  id: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  activityHours?: ActivityHours;
  restDays?: number[];
  dailyPostLimit?: number;
  personaId?: string;
}

export interface AccountList {
  accounts: NaverAccount[];
}

const ensureDataDir = (): void => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
};

// MongoDB export 형식을 NaverAccount로 변환
const convertMongoAccount = (mongo: MongoExportAccount): NaverAccount => ({
  id: mongo.accountId,
  password: mongo.password,
  nickname: mongo.nickname,
  isMain: mongo.isMain,
  activityHours: mongo.activityHours,
  restDays: mongo.restDays,
  dailyPostLimit: mongo.dailyPostLimit,
  personaId: mongo.personaId,
});

// 정적 JSON 파일에서 계정 로드
const getStaticAccounts = (): NaverAccount[] => {
  if (!existsSync(STATIC_ACCOUNTS_FILE)) {
    console.warn('[ACCOUNTS] 정적 계정 파일 없음:', STATIC_ACCOUNTS_FILE);
    return [];
  }

  try {
    const data = readFileSync(STATIC_ACCOUNTS_FILE, 'utf-8');
    const parsed: MongoExportAccount[] = JSON.parse(data);
    return parsed.map(convertMongoAccount);
  } catch (err) {
    console.error('[ACCOUNTS] 정적 계정 파일 파싱 실패:', err);
    return [];
  }
};

// 동적 파일에서 계정 로드 (기존 로직)
const getDynamicAccounts = (): NaverAccount[] => {
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
};

export const getAccounts = (): NaverAccount[] => {
  if (USE_STATIC_ACCOUNTS) {
    return getStaticAccounts();
  }
  return getDynamicAccounts();
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

export const getPersonaId = (account: NaverAccount): string | null => {
  if (account.personaId) {
    return account.personaId;
  }

  return null;
};

export const isAccountActive = (account: NaverAccount): boolean => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  if (account.restDays?.includes(currentDay)) {
    return false;
  }

  if (account.activityHours) {
    const { start, end } = account.activityHours;

    if (start > end) {
      return currentHour >= start || currentHour < end;
    }

    return currentHour >= start && currentHour < end;
  }

  return true;
};

export const getActiveAccounts = (): NaverAccount[] => {
  return getAccounts().filter(isAccountActive);
};

export const getNextActiveTime = (account: NaverAccount): number => {
  const now = new Date();
  const currentHour = now.getHours();

  if (isAccountActive(account)) {
    return 0;
  }

  if (!account.activityHours) {
    return 0;
  }

  const { start, end } = account.activityHours;

  let targetDate = new Date(now);
  targetDate.setMinutes(0, 0, 0);

  if (start > end) {
    if (currentHour < end) {
      return 0;
    } else if (currentHour < start) {
      targetDate.setHours(start);
    } else {
      return 0;
    }
  } else {
    if (currentHour < start) {
      targetDate.setHours(start);
    } else {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(start);
    }
  }

  if (account.restDays) {
    while (account.restDays.includes(targetDate.getDay())) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
  }

  return Math.max(0, targetDate.getTime() - now.getTime());
};
