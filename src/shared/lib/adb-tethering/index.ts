/**
 * ADB USB Tethering 유틸리티
 *
 * 여러 안드로이드 폰을 USB로 연결한 뒤, 계정별로 다른 폰의 LTE IP를 쓸 수 있게
 * USB 테더링 on/off + 에어플레인 모드 토글(IP 갱신)을 자동화한다.
 *
 * ⚠️ 현재 미사용(구현만 해둠). 실제 적용 시 매핑·호출부 주입 필요.
 *
 * 사용 예시:
 *   import { getDeviceForAccount, enableTethering, refreshIp } from '@/shared/lib/adb-tethering';
 *
 *   const device = getDeviceForAccount(accountId);
 *   await enableTethering(device.serial);
 *   // ... 봇 작업 수행 ...
 *   await refreshIp(device.serial); // 새 IP 필요 시
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AdbDevice {
  serial: string;           // adb devices 에 뜨는 시리얼 (예: "R58M30ABCD")
  label: string;            // 사람이 알아보는 이름 (예: "갤럭시-1")
  carrier?: 'SKT' | 'KT' | 'LGU+';
}

export interface TetheringResult {
  success: boolean;
  serial: string;
  message?: string;
  error?: string;
}

/**
 * 연결된 모든 ADB 디바이스 시리얼 조회.
 *
 * 실행 예:
 *   $ adb devices
 *   List of devices attached
 *   R58M30ABCD    device
 *   R58M40EFGH    device
 */
export const listDevices = async (): Promise<string[]> => {
  const { stdout } = await execAsync('adb devices');
  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('device'))
    .map((line) => line.split(/\s+/)[0]);
};

/**
 * 특정 디바이스에 adb shell 명령 실행.
 */
const execOnDevice = async (serial: string, shellCmd: string): Promise<string> => {
  const { stdout } = await execAsync(`adb -s ${serial} shell ${shellCmd}`);
  return stdout.trim();
};

/**
 * USB 테더링 ON — Rndis 드라이버 활성화.
 * macOS가 해당 폰을 이더넷 인터페이스로 인식하게 됨.
 *
 * ⚠️ 기기별로 명령이 다를 수 있음. Pixel/Samsung 대부분 동작:
 *   svc usb setFunctions rndis
 *
 * 일부 기기는 UI 자동화 필요:
 *   settings put global tether_dun_required 0
 *   am start -n com.android.settings/.TetherSettings
 */
export const enableTethering = async (serial: string): Promise<TetheringResult> => {
  try {
    await execOnDevice(serial, 'svc usb setFunctions rndis');
    return { success: true, serial, message: 'USB 테더링 활성화' };
  } catch (error) {
    return {
      success: false,
      serial,
      error: error instanceof Error ? error.message : 'tethering on 실패',
    };
  }
};

/**
 * USB 테더링 OFF — 기본 MTP로 복귀.
 */
export const disableTethering = async (serial: string): Promise<TetheringResult> => {
  try {
    await execOnDevice(serial, 'svc usb setFunctions mtp');
    return { success: true, serial, message: 'USB 테더링 해제' };
  } catch (error) {
    return {
      success: false,
      serial,
      error: error instanceof Error ? error.message : 'tethering off 실패',
    };
  }
};

/**
 * 에어플레인 모드 on → off 반복으로 LTE 재연결 → 새 IP 할당.
 *
 * 캐리어가 NAT 재할당을 해주면 IP 바뀜. 안 바뀌면 2~3회 반복 필요.
 * (통신사마다 다름: SKT는 자주 바뀜, KT/LGU+는 덜 바뀔 수 있음)
 */
export const refreshIp = async (serial: string): Promise<TetheringResult> => {
  try {
    await execOnDevice(serial, 'settings put global airplane_mode_on 1');
    await execOnDevice(serial, 'am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true');
    await new Promise((r) => setTimeout(r, 3000));
    await execOnDevice(serial, 'settings put global airplane_mode_on 0');
    await execOnDevice(serial, 'am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false');
    await new Promise((r) => setTimeout(r, 5000)); // LTE 재연결 대기
    return { success: true, serial, message: 'IP 갱신 완료 (에어플레인 모드 토글)' };
  } catch (error) {
    return {
      success: false,
      serial,
      error: error instanceof Error ? error.message : 'IP 갱신 실패',
    };
  }
};

/**
 * 현재 테더링 네트워크의 공용 IP 조회 (실행 환경에서 curl로 확인).
 * 실제로 테더링이 잘 붙었는지 검증용.
 */
export const getCurrentPublicIp = async (): Promise<string | null> => {
  try {
    const { stdout } = await execAsync('curl -s --max-time 5 https://api.ipify.org');
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

// ============================================================
// 계정 ↔ 디바이스 매핑
// ============================================================

/**
 * 계정별로 어떤 폰을 쓸지 고정 매핑.
 * 실제 적용 시 .env 또는 별도 config 파일로 뺄 것.
 *
 * 예시 (핸드폰 4대 × 계정 6개씩):
 *   DEVICE_POOL = [
 *     { serial: 'R58M30ABCD', label: '갤럭시-1', carrier: 'SKT' },
 *     { serial: 'R58M40EFGH', label: '갤럭시-2', carrier: 'KT' },
 *     { serial: 'R58M50IJKL', label: '갤럭시-3', carrier: 'LGU+' },
 *     { serial: 'R58M60MNOP', label: '갤럭시-4', carrier: 'SKT' },
 *   ];
 */
export const DEVICE_POOL: AdbDevice[] = [
  // TODO: 실제 디바이스 시리얼 등록
  // { serial: 'R58M30ABCD', label: '갤럭시-1', carrier: 'SKT' },
];

/**
 * 계정 ID → 고정 디바이스 매핑 (해시 기반).
 * DEVICE_POOL 비어있으면 null 반환.
 */
export const getDeviceForAccount = (accountId: string): AdbDevice | null => {
  if (DEVICE_POOL.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) | 0;
  }
  return DEVICE_POOL[Math.abs(hash) % DEVICE_POOL.length];
};

// ============================================================
// 워크플로우 래퍼
// ============================================================

/**
 * 한 계정 작업을 위한 네트워크 준비:
 *   1. 해당 계정의 디바이스 찾기
 *   2. USB 테더링 ON
 *   3. (옵션) 새 IP 필요하면 refreshIp
 *   4. 현재 public IP 반환
 *
 * 실제 Playwright 컨텍스트와 연결하려면 OS 라우팅 테이블 조작이 필요.
 * macOS의 경우 `networksetup -setnetworkserviceenabled` 로 Wi-Fi 끄고 이더넷 우선.
 * → 이 부분은 현재 미구현. 수동 또는 후속 작업.
 */
export const prepareNetworkForAccount = async (
  accountId: string,
  options: { refresh?: boolean } = {},
): Promise<{ device: AdbDevice | null; publicIp: string | null }> => {
  const device = getDeviceForAccount(accountId);
  if (!device) return { device: null, publicIp: null };

  await enableTethering(device.serial);
  if (options.refresh) {
    await refreshIp(device.serial);
  }

  const publicIp = await getCurrentPublicIp();
  return { device, publicIp };
};
