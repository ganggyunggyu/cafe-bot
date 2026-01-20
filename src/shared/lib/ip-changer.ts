import {
  checkAdbConnection,
  toggleAirplaneMode,
  setUsbTethering,
} from './adb-controller';
import { ADB_CONFIG } from '../config/adb-config';

export interface IPChangeResult {
  success: boolean;
  previousIP?: string;
  newIP?: string;
  error?: string;
}

export const getCurrentIP = async (): Promise<string | null> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return null;
  }
};

export const changeIP = async (): Promise<IPChangeResult> => {
  if (!ADB_CONFIG.enabled) {
    return { success: false, error: 'ADB IP 변경 비활성화됨' };
  }

  const connectionResult = await checkAdbConnection();
  if (!connectionResult.success) {
    console.log('[IP-Changer] ADB 연결 안됨, 스킵');
    return { success: false, error: connectionResult.error };
  }

  const previousIP = await getCurrentIP();
  console.log(`[IP-Changer] 현재 IP: ${previousIP}`);

  const toggleResult = await toggleAirplaneMode(ADB_CONFIG.airplaneDelay);
  if (!toggleResult.success) {
    return { success: false, error: toggleResult.error, previousIP: previousIP || undefined };
  }

  console.log(`[IP-Changer] 네트워크 복구 대기 ${ADB_CONFIG.networkRecoveryDelay}ms...`);
  await sleep(ADB_CONFIG.networkRecoveryDelay);

  if (ADB_CONFIG.tetheringType === 'usb') {
    await setUsbTethering();
    await sleep(2000);
  }

  let newIP: string | null = null;
  for (let i = 0; i < ADB_CONFIG.maxRetries; i++) {
    newIP = await getCurrentIP();
    if (newIP && newIP !== previousIP) {
      break;
    }
    console.log(`[IP-Changer] IP 변경 확인 재시도 ${i + 1}/${ADB_CONFIG.maxRetries}...`);
    await sleep(2000);
  }

  if (!newIP) {
    return {
      success: false,
      error: 'IP 조회 실패',
      previousIP: previousIP || undefined,
    };
  }

  if (newIP === previousIP) {
    return {
      success: false,
      error: 'IP가 변경되지 않음',
      previousIP: previousIP || undefined,
      newIP,
    };
  }

  console.log(`[IP-Changer] IP 변경 완료: ${previousIP} → ${newIP}`);

  return {
    success: true,
    previousIP: previousIP || undefined,
    newIP,
  };
};

export const verifyIPChanged = async (previousIP: string): Promise<boolean> => {
  const currentIP = await getCurrentIP();
  return currentIP !== null && currentIP !== previousIP;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
