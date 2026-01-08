import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), '.cafe-bot-data');
const ACCOUNTS_FILE = join(DATA_DIR, 'accounts.json');

export interface NaverAccount {
  id: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
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
}
