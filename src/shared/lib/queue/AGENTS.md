# shared/lib/queue — BullMQ Queue System

## OVERVIEW

BullMQ 기반 작업 큐. 계정별 task 큐(concurrency 1) + 전역 generate 큐(concurrency 3). Redis-backed 순서 보장.

## STRUCTURE

```
queue/
├── index.ts            # 큐 팩토리 + addTaskJob() (dedup, delay)
├── task-job-harness.ts # addTaskJob용 deterministic seam + jobId 규칙
├── types.ts            # JobData 타입 (Post/Comment/Reply/Generate)
├── workers.ts          # 워커 생성 + processTaskJob 진입점
├── workers-processor.ts # 워커 프로세서 (userId 지원 버전, 미사용)
├── sequence.ts         # runtime wrapper — Redis 기반 순서 보장
├── sequence-harness.ts # sequence 로직용 injectable controller
├── testing/
│   └── queue-test-harness.ts # fake queue / fake redis / fake clock
├── task-job-harness.test.ts
├── sequence-harness.test.ts
└── handlers/
    ├── index.ts        # barrel
    ├── post-handler.ts # ★ 542줄 — 글 발행 + 댓글/답글 체이닝
    ├── comment-handler.ts # 162줄 — 댓글 발행 + 순서 대기
    └── reply-handler.ts   # 181줄 — 답글 발행 + 부모 댓글 해결
```

## WHERE TO LOOK

| Task | File | Key Function |
|------|------|-------------|
| 큐에 작업 추가 | `index.ts` | `addTaskJob(accountId, data, delay?)` |
| 작업 중복 방지 | `task-job-harness.ts` | `generateTaskJobId(data)` — content hash 기반 |
| 워커 시작 | `workers.ts` | `startAllTaskWorkers()` — 모든 계정 워커 생성 |
| 잡 처리 라우팅 | `workers.ts` | `processTaskJob()` → handler dispatch |
| 글 발행 | `handlers/post-handler.ts` | `handlePostJob()` — 가장 복잡 |
| 순서 대기 | `sequence-harness.ts` | `waitForSequenceTurn()` — injected clock/redis 지원 |
| 순서 진행 | `sequence-harness.ts` | `advanceSequence()` — Redis incr |
| 큐 하네스 실행 | `docs/HARNESS_ENGINEERING.md` | `npm run test:harness` |

## KEY FLOWS

### Job ID 생성 규칙 (중복 방지)
```
post:    post_{accountId}_{md5(subject)[0:8]}{_r{rescheduleToken}}
comment: comment_{accountId}_{articleId}_{md5(content)[0:8]}{_seq_{seqId}_{idx}}{_r{token}}
reply:   reply_{accountId}_{articleId}_{commentIdx}_{md5(content)[0:8]}{_seq_...}{_r_...}
```

### Post Job 처리 흐름
```
processTaskJob → handlePostJob
  1. writePostWithAccount() (Playwright — features/auto-comment/batch/post-writer.ts)
  2. PublishedArticle 저장 (MongoDB)
  3. incrementTodayPostCount (일일 제한)
  4. viralComments 있으면 → 댓글/답글 Job 추가 (고정 딜레이)
  5. viralComments 없으면 → API로 댓글 생성 → Job 추가
```

### Sequence 순서 보장 (댓글 체이닝)
```
Redis key: comment_sequence:{sequenceId}
  waitForSequenceTurn(seqId, index) → polling 2초 간격
    index === current → 'ready' (실행)
    index < current  → 'skipped' (이미 지남)
    timeout 30초     → 'pending' (재스케줄, 순서 정보 없이!)
  advanceSequence(seqId) → incr + TTL 갱신
```

## CONVENTIONS

- 큐 이름: `task_{accountId}` (계정별), `generate` (전역)
- Task 큐: attempts 3, exponential backoff 5s, keep 100 completed/50 failed
- Generate 큐: attempts 2, fixed backoff 3s
- Worker: lock 10min, renewal 30s, stalled check 2min, max stalled 3
- globalThis로 HMR 대응: `__taskWorkers`, `__generateWorker`
- 큐/시퀀스 로직 변경 시 deterministic harness test 같이 수정

## ANTI-PATTERNS

### ⛔ CRITICAL
1. **shared → feature 순환 의존**: `types.ts` imports `PostOptions` from `features/auto-comment/batch/types.ts`
2. **post-handler.ts → feature 의존**: imports `writePostWithAccount` from `features/auto-comment/batch/post-writer.ts`

### ⚠️ GOTCHAS
1. **Sequence timeout 순서 깨짐**: 30초 대기 초과 → `pending` → 순서 정보 없이 재스케줄 → 후속 작업 순서 불보장
2. **중복 Job 무시**: waiting/delayed/active 상태의 같은 jobId → 조용히 스킵 (로그 있지만 에러 아님)
3. **workers-processor.ts 미사용**: userId 지원 버전이지만 실제 코드는 workers.ts 사용
4. **rescheduleToken 필수**: 같은 콘텐츠 재발행 시 `createRescheduleToken()` 없으면 dedup에 걸림
5. **비활동 시간 재스케줄**: 계정 비활동 → `getNextActiveTime()` 만큼 딜레이 후 재큐잉
