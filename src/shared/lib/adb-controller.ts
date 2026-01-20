import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AdbResult {
  success: boolean;
  output?: string;
  error?: string;
}

export const checkAdbConnection = async (): Promise<AdbResult> => {
  try {
    const { stdout } = await execAsync('adb devices');
    const lines = stdout.trim().split('\n');

    const devices = lines.slice(1).filter((line) => line.includes('device'));

    if (devices.length === 0) {
      return { success: false, error: 'ADB 연결된 기기 없음' };
    }

    return { success: true, output: devices[0] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'ADB 실행 실패';
    return { success: false, error: msg };
  }
};

export const executeAdbCommand = async (command: string): Promise<AdbResult> => {
  try {
    const { stdout, stderr } = await execAsync(`adb shell ${command}`);

    if (stderr && stderr.length > 0) {
      return { success: false, error: stderr };
    }

    return { success: true, output: stdout.trim() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'ADB 명령 실패';
    return { success: false, error: msg };
  }
};

export const enableAirplaneMode = async (): Promise<AdbResult> => {
  return executeAdbCommand('cmd connectivity airplane-mode enable');
};

export const disableAirplaneMode = async (): Promise<AdbResult> => {
  return executeAdbCommand('cmd connectivity airplane-mode disable');
};

export const toggleAirplaneMode = async (delayMs: number = 2000): Promise<AdbResult> => {
  const onResult = await enableAirplaneMode();
  if (!onResult.success) {
    return { success: false, error: `비행기 모드 ON 실패: ${onResult.error}` };
  }

  await sleep(delayMs);

  const offResult = await disableAirplaneMode();
  if (!offResult.success) {
    return { success: false, error: `비행기 모드 OFF 실패: ${offResult.error}` };
  }

  return { success: true };
};

export const setMobileData = async (enable: boolean): Promise<AdbResult> => {
  const command = enable ? 'svc data enable' : 'svc data disable';
  return executeAdbCommand(command);
};

export const setUsbTethering = async (): Promise<AdbResult> => {
  return executeAdbCommand('svc usb setFunctions rndis');
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
