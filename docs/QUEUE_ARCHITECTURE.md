# Queue Architecture

## Overview

이 프로젝트는 **계정별 동적 큐 격리** 방식을 사용한다. 각 계정(accountId)마다 독립적인 큐와 워커가 생성되어, 계정 간 작업이 서로 영향을 주지 않는다.

## 핵심 구조

```
┌─────────────────────────────────────────────────────────────┐
│                        Redis                                 │
├─────────────────────────────────────────────────────────────┤
│  bull:generate_accountA:*    bull:publish_accountA:*        │
│  bull:generate_accountB:*    bull:publish_accountB:*        │
│  bull:generate_accountC:*    bull:publish_accountC:*        │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │  Account A  │     │  Account B  │     │  Account C  │
   ├─────────────┤     ├─────────────┤     ├─────────────┤
   │ Generate Q  │     │ Generate Q  │     │ Generate Q  │
   │ Generate W  │     │ Generate W  │     │ Generate W  │
   │ Publish Q   │     │ Publish Q   │     │ Publish Q   │
   │ Publish W   │     │ Publish W   │     │ Publish W   │
   └─────────────┘     └─────────────┘     └─────────────┘
```

## 큐 종류

| 큐 타입 | 역할 | 처리 워커 |
|--------|------|----------|
| `generate_{accountId}` | 블로그 글 생성 요청 | `processGenerate` |
| `publish_{accountId}` | 네이버 블로그 발행 요청 | `processPublish` |

## 동작 방식

### 1. 큐 생성 (Lazy Initialization)

```typescript
const queue = getGenerateQueue(accountId);
```

- 큐가 없으면 새로 생성
- 큐 생성 시 워커도 자동으로 함께 생성
- Map에 캐싱하여 중복 생성 방지

### 2. 큐 이름 생성 규칙

```typescript
const getQueueName = (type: 'generate' | 'publish', accountId: string): string => {
  const safeAccountId = accountId.replace(/[^a-zA-Z0-9]/g, '_');
  return `${type}_${safeAccountId}`;
};
```

### 3. Concurrency 설정

```typescript
const worker = new Worker(queueName, processor, {
  connection,
  concurrency: 1,
});
```

**왜 concurrency: 1인가?**
- 네이버 블로그 API 제한 회피
- 브라우저 세션 충돌 방지
- 순차적 발행으로 안정성 확보

## Job 흐름

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Schedule │────▶│ Generate │────▶│ Publish  │
│   API    │     │   Queue  │     │   Queue  │
└──────────┘     └──────────┘     └──────────┘
                       │                │
                       ▼                ▼
                 ┌──────────┐     ┌──────────┐
                 │  Gemini  │     │  Naver   │
                 │   API    │     │   Blog   │
                 └──────────┘     └──────────┘
```

## 알려진 맹점 및 해결책

### 1. 현재 락 시스템과 충돌
- 현재: in-memory lock (acquireAccountLock)
- 제안: Redis Bull queue
- **해결**: 하나로 통일 필요

### 2. 서버 재시작 시 Playwright 세션 문제
```typescript
const processPublish = async (job) => {
  await ensureSessionReady(job.data.accountId);
};
```

### 3. Generate 결과 유실 위험
```typescript
await DraftArticle.create({
  accountId,
  content: generatedContent,
  status: 'pending_publish',
});
```

### 4. Dead Letter Queue 필요
```typescript
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await dlqQueue.add('dead', {
      originalJob: job.data,
      error: err.message,
    });
  }
});
```

### 5. 브라우저 행 시 전체 워커 블록
```typescript
await Promise.race([
  doPublish(job.data),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Publish timeout')), 5 * 60 * 1000)
  ),
]);
```

### 6. 큐 정리 메커니즘
```typescript
setInterval(async () => {
  for (const [accountId, lastUsed] of queueLastUsed) {
    if (Date.now() - lastUsed > 24 * 60 * 60 * 1000) {
      await cleanupAccountQueues(accountId);
    }
  }
}, 60 * 60 * 1000);
```

## 우선순위별 TODO

| 우선순위 | 항목 | 이유 |
|---------|------|------|
| 🔴 높음 | Generate 결과 DB 저장 | 데이터 유실 방지 |
| 🔴 높음 | 작업 타임아웃 | 무한 대기 방지 |
| 🟡 중간 | 세션 복구 로직 | 재시작 후 동작 보장 |
| 🟡 중간 | 실패 알림 | 문제 빠른 인지 |
| 🟢 낮음 | 큐 정리 메커니즘 | 메모리 효율 |
| 🟢 낮음 | Bull Board UI | 시각적 모니터링 |
