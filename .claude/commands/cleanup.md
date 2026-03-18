# 작업 전 환경 정리

좀비 크롬 프로세스 종료 + Redis 큐 완료/실패 잡 데이터 정리를 한번에 수행합니다.

## 작업 흐름

### 1단계: 좀비 크롬 정리

`Google Chrome for Testing` 프로세스가 남아있으면 전부 `pkill -9`로 종료합니다.

### 2단계: Redis 큐 정리

모든 `task_*` 큐에서:
- **completed** 잡 데이터 전부 삭제
- **failed** 잡 데이터 전부 삭제
- delayed/waiting/active 잡은 건드리지 않음 (진행 예정 작업 보호)

### 3단계: 실행

```bash
npx tsx scripts/cleanup.ts
```

### 4단계: 결과 리포트

정리된 크롬 프로세스 수, completed/failed 잡 수를 사용자에게 보고합니다.

## 사용 시점

- 매일 작업 시작 전
- 서버 크래시 후 재시작 전
- 브라우저가 안 뜰 때

## 파일 경로

- 스크립트: `scripts/cleanup.ts`

## 사용법

```
/cleanup
```
