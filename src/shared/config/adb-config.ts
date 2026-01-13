export interface AdbConfig {
  enabled: boolean;
  airplaneDelay: number; // 비행기 모드 ON 유지 시간 (ms)
  networkRecoveryDelay: number; // 비행기 모드 OFF 후 네트워크 복구 대기 (ms)
  tetheringType: 'usb' | 'wifi';
  maxRetries: number; // IP 변경 확인 재시도 횟수
}

export const ADB_CONFIG: AdbConfig = {
  enabled: true, // false로 설정하면 IP 변경 기능 비활성화
  airplaneDelay: 2000, // 2초
  networkRecoveryDelay: 5000, // 5초
  tetheringType: 'usb',
  maxRetries: 3,
};
