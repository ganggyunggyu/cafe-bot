# 리팩토링: 글로벌 단일 큐 전환

## 현재 구조

- per-account 큐: `task_compare14310`, `task_fail5644`, ...
- 각 큐마다 BullMQ Worker (concurrency: 1)
- 글로벌 락으로 동시 처리 1건 제한 (processTaskJob 내부)

## 문제점

- BullMQ가 워커에 잡 넘기는 시점에 Redis `active`로 이동
- 글로벌 락 대기 중인 잡도 Redis에선 `active`로 표시
- 대기 중 잡들이 불필요하게 lock renew (30초마다)
- stalled 감지가 부정확할 수 있음

## 목표 구조

- 단일 글로벌 큐: `task_global` (concurrency: 1)
- 잡 데이터에 accountId 포함 (기존과 동일)
- BullMQ 레벨에서 active 1 / waiting N 정확히 관리

## 변경 범위

### 큐 등록 (`addTaskJob`)

```typescript
// Before: per-account 큐
const queueName = getTaskQueueName(accountId); // task_{accountId}

// After: 글로벌 큐
const GLOBAL_QUEUE = 'task_global';
```

### 워커 생성 (`createTaskWorker` → `createGlobalWorker`)

```typescript
// Before: 계정별 워커 N개
for (const account of accounts) {
  createTaskWorker(account.id);
}

// After: 글로벌 워커 1개
createGlobalWorker();
```

### 잡 스케줄링 순서

- delayed 잡은 시간 기반으로 firing → waiting → active
- 같은 시간에 여러 잡 firing 시 BullMQ가 순차 처리
- accountId 기반 우선순위는 별도 고려 불필요 (시간순 처리)

## 마이그레이션

1. 기존 per-account 큐의 delayed 잡들을 글로벌 큐로 이전
2. 기존 워커 종료 → 글로벌 워커 시작
3. `run-schedule.ts` 등 스크립트에서 `addTaskJob` 호출부 변경 없음 (내부 큐 이름만 변경)

## 장점

- Redis 상태가 정확 (active 1, waiting N)
- lock renew 낭비 없음
- stalled 감지 정확
- 모니터링 깔끔

## 단점

- 계정별 큐 분리의 유연성 상실 (나중에 멀티 브라우저 확장 시 재분리 필요)
- 마이그레이션 중 기존 delayed 잡 이전 작업 필요

## 우선순위

낮음 — 현재 글로벌 락 방식으로 기능적으로 동일하게 동작 중
