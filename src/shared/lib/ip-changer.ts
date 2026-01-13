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

// 현재 공인 IP 조회
export const getCurrentIP = async (): Promise<string | null> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return null;
  }
};

// IP 변경 메인 함수
export const changeIP = async (): Promise<IPChangeResult> => {
  if (!ADB_CONFIG.enabled) {
    return { success: false, error: 'ADB IP 변경 비활성화됨' };
  }

  // ADB 연결 확인
  const connectionResult = await checkAdbConnection();
  if (!connectionResult.success) {
    console.log('[IP-Changer] ADB 연결 안됨, 스킵');
    return { success: false, error: connectionResult.error };
  }

  // 이전 IP 저장
  const previousIP = await getCurrentIP();
  console.log(`[IP-Changer] 현재 IP: ${previousIP}`);

  // 비행기 모드 토글
  const toggleResult = await toggleAirplaneMode(ADB_CONFIG.airplaneDelay);
  if (!toggleResult.success) {
    return { success: false, error: toggleResult.error, previousIP: previousIP || undefined };
  }

  // 네트워크 복구 대기
  console.log(`[IP-Changer] 네트워크 복구 대기 ${ADB_CONFIG.networkRecoveryDelay}ms...`);
  await sleep(ADB_CONFIG.networkRecoveryDelay);

  // USB 테더링 재활성화 (필요시)
  if (ADB_CONFIG.tetheringType === 'usb') {
    await setUsbTethering();
    await sleep(2000);
  }

  // 새 IP 확인 (재시도 로직)
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

// IP 변경 검증
export const verifyIPChanged = async (previousIP: string): Promise<boolean> => {
  const currentIP = await getCurrentIP();
  return currentIP !== null && currentIP !== previousIP;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
