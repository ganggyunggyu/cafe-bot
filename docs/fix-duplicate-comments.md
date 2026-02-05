# 댓글/대댓글 중복 작성 버그 수정

## 증상

같은 계정이 동일한 댓글을 2~3회 중복 작성하는 현상 발생.
특히 **시퀀스의 마지막 댓글**에서 집중적으로 발생. 시각이 동일함.

```
높은햄스터985: 이노스케씨 진정하고 같이 차 한 잔 마셔요으아악!!!!  (14:47)
높은햄스터985: 이노스케씨 진정하고 같이 차 한 잔 마셔요으아악!!!!  (14:47)
높은햄스터985: 이노스케씨 진정하고 같이 차 한 잔 마셔요으아악!!!!  (14:48)
```

---

## 원인 분석

### 핵심 원인: 시퀀스 대기 reschedule이 중복 잡을 생성

이게 **가장 직접적인 원인**. 마지막 댓글에만 발생하는 이유를 정확히 설명함.

**문제 코드** (comment-handler.ts, reply-handler.ts):

```typescript
if (turn === 'pending') {
  await addTaskJob(
    data.accountId,
    { ...data, rescheduleToken: createRescheduleToken() },  // ← 매번 새 토큰
    retryDelay
  );
}
```

**흐름:**

```
1. 마지막 댓글 잡 실행 → waitForSequenceTurn → 'pending' (아직 차례 아님)
2. rescheduleToken: "ml6abc_xy12" 로 새 잡 등록 → 잡 ID 변경됨
3. 원래 잡 완료 처리 (BullMQ에서 completed)
4. 10초 후 새 잡 실행 → 아직 pending → 또 rescheduleToken: "ml6def_zz99" 로 새 잡 등록
5. 이 과정이 N번 반복 → 같은 댓글의 복사본이 N개 쌓임
6. 드디어 시퀀스 차례 도달 → 복사본 전부 동시에 'ready' 받음 → 전부 실행
→ 결과: 동일 댓글 3개 (동일 시각)
```

**왜 마지막 댓글만 영향받나:**
마지막 댓글이 가장 오래 기다리므로 reschedule 횟수가 가장 많음.
앞쪽 댓글은 금방 차례가 돌아와서 복사본이 1~2개 수준 → 문제 안 됨.

### 보조 원인 1: BullMQ stalled job 재실행

BullMQ 워커 설정 (`src/shared/lib/queue/workers.ts`):

| 설정 | 값 | 설명 |
|------|-----|------|
| `lockDuration` | 10분 | 잡 처리 중 lock 유지 시간 |
| `stalledInterval` | 2분 | stalled 체크 주기 |
| `maxStalledCount` | 3 | 최대 stalled 허용 횟수 |

댓글 작성이 오래 걸리면 BullMQ가 잡을 stalled 처리 후 재실행.
원래 잡도 아직 실행 중이므로 동시에 2개가 돌아감.

### 보조 원인 2: attempts: 3 재시도

```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
}
```

댓글이 네이버에 작성됐지만 Promise.race에서 타임아웃이 먼저 발생하면,
BullMQ가 잡을 실패로 처리 → 자동 재시도 → 댓글 재작성.

### 보조 원인 3: hasCommented 체크의 race condition

```
Job A: hasCommented() → false → 댓글 작성 시작
Job B: hasCommented() → false (A가 아직 DB 저장 안 함) → 댓글 작성 시작
→ 결과: 동일 댓글 2개
```

---

## 수정 내용

### 수정 1: 시퀀스 대기 reschedule 토큰 고정

**핵심 수정.** 시퀀스 pending reschedule 시 매번 새 토큰 대신 고정 토큰 `'seqwait'` 사용.

```typescript
// 수정 전: 매번 새 잡 ID 생성 → 복사본 누적
{ ...data, rescheduleToken: createRescheduleToken() }

// 수정 후: 고정 잡 ID → BullMQ dedup이 중복 차단
{ ...data, rescheduleToken: 'seqwait' }
```

**효과:** 잡 ID가 항상 동일하므로 `addTaskJob` 내부 중복 체크에서 기존 잡(delayed/waiting)이 있으면 스킵.

```typescript
// addTaskJob 내부 (index.ts)
const existingJob = await queue.getJob(jobId);
if (existingJob) {
  const state = await existingJob.getState();
  if (['waiting', 'delayed', 'active'].includes(state)) {
    return null;  // ← 여기서 차단됨
  }
}
```

### 수정 2: Redis 기반 write lock

**보조 방어선.** 댓글 작성 직전에 Redis `SET NX` (atomic) lock.

```typescript
const acquireWriteLock = async (
  cafeId: number, articleId: number, accountId: string, content: string
): Promise<boolean> => {
  const redis = getRedisConnection();
  const contentKey = content.slice(0, 30).replace(/\s+/g, '');
  const lockKey = `write_lock:comment:${cafeId}:${articleId}:${accountId}:${contentKey}`;
  const result = await redis.set(lockKey, '1', 'EX', WRITE_LOCK_TTL, 'NX');
  return result === 'OK';
};
```

| 항목 | 설명 |
|------|------|
| `SET NX` | atomic 연산이라 race condition 없음 |
| `EX 600` | 10분 후 자동 만료 (영구 lock 방지) |
| lock key | `write_lock:{type}:{cafeId}:{articleId}:{accountId}:{content앞30자}` |
| 적용 위치 | `hasCommented` 체크 이후, 실제 `writeComment` 호출 이전 |

### 방어 흐름 (수정 후, 3단계 방어)

```
1. hasCommented() → DB에 기록 있으면 스킵
2. acquireWriteLock() → Redis NX lock 획득 실패하면 스킵
3. writeCommentWithAccount() → 실제 댓글 작성
4. addCommentToArticle() → DB 기록 저장
```

시퀀스 복사본은 수정 1에서 차단, stalled/retry 중복은 수정 2에서 차단.

---

## 수정 파일

| 파일 | 수정 내용 |
|------|-----------|
| `src/shared/lib/queue/handlers/comment-handler.ts` | Redis write lock + seqwait 고정 토큰 |
| `src/shared/lib/queue/handlers/reply-handler.ts` | Redis write lock + seqwait 고정 토큰 |

---

## 잔여 리스크

- lock TTL(10분) 내에 정상 실패한 잡은 재시도 불가 → 10분이면 충분히 결과 판별 가능
- content 앞 30자 기준이라, 앞 30자가 같은 다른 댓글은 차단될 수 있음 → 실질적으로 발생 확률 극히 낮음
