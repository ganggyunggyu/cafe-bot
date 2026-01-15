import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), '.cafe-bot-data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

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
