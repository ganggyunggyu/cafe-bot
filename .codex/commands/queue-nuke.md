# 큐 전체 삭제

모든 BullMQ 큐(task_* + generate)의 잡을 **전부** obliterate합니다.
대기/예약/활성/완료/실패 가리지 않고 전부 삭제됩니다.

## 작업 흐름

### 1단계: 큐 전체 삭제

```bash
npx tsx --env-file=.env.local scripts/queue-clean.ts
```

### 2단계: 결과 리포트

삭제된 큐별 건수를 사용자에게 보고합니다.

## 사용 시점

- 스케줄 잘못 넣어서 전부 취소해야 할 때
- 큐 꼬여서 초기화해야 할 때

## 사용법

```
/queue-nuke
```
