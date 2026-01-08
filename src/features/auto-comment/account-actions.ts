'use server';

import {
  addAccount,
  getAccounts,
  removeAccount,
  setMainAccount,
  type NaverAccount,
} from '@/shared/lib/account-manager';
import { loginAccount } from '@/shared/lib/multi-session';

export interface AccountActionResult {
  success: boolean;
  accounts?: NaverAccount[];
  error?: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const getAccountList = async (): Promise<AccountActionResult> => {
  try {
    const accounts = getAccounts();
    return { success: true, accounts };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, '알 수 없는 오류') };
  }
}

export const addAccountAction = async (account: NaverAccount): Promise<AccountActionResult> => {
  try {
    const accounts = addAccount(account);
    return { success: true, accounts };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, '알 수 없는 오류') };
  }
}

export const removeAccountAction = async (id: string): Promise<AccountActionResult> => {
  try {
    const accounts = removeAccount(id);
    return { success: true, accounts };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, '알 수 없는 오류') };
  }
}

export const setMainAccountAction = async (id: string): Promise<AccountActionResult> => {
  try {
    const accounts = setMainAccount(id);
    return { success: true, accounts };
  } catch (error) {
    return { success: false, error: getErrorMessage(error, '알 수 없는 오류') };
  }
}

export const loginAccountAction = async (
  id: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    return await loginAccount(id, password);
  } catch (error) {
    return { success: false, error: getErrorMessage(error, '알 수 없는 오류') };
  }
}
