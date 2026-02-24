# features/auto-comment/batch — Batch Processing System

## OVERVIEW

키워드 기반 대량 글/댓글/답글 발행 시스템. 25 files. 콘텐츠 생성 → 큐잉 → Playwright 글작성 → 이미지 업로드 → 닉네임 변경 → 카페 가입까지 전체 자동화 파이프라인.

## STRUCTURE

```
batch/
├── index.ts              # barrel (28 exports)
├── types.ts              # ★ 공유 타입 (PostOptions, ProgressCallback, DelayConfig)
│
│  # 핵심 파이프라인
├── batch-queue.ts        # 키워드 → 큐 변환 (addBatchToQueue)
├── batch-job.ts          # 레거시 직렬 처리 (249줄)
├── batch-actions.ts      # server action 래퍼
├── batch-helpers.ts      # 배치 컨텍스트 초기화
├── keyword-processor.ts  # ★ 385줄 — 키워드별 처리 상태머신
├── keyword-utils.ts      # 키워드 파싱 (category 분리)
│
│  # Playwright 브라우저 자동화
├── post-writer.ts        # ★ 488줄 — 글 작성 (에디터, 옵션, 이미지)
├── article-modifier.ts   # 기존 글 수정
├── image-uploader.ts     # 이미지 업로드 (307줄)
├── cafe-join.ts          # 카페 가입 자동화 (201줄)
├── nickname-changer.ts   # 닉네임 변경 (347줄)
├── nickname-generator.ts # 닉네임 생성
│
│  # 수정 배치
├── modify-batch-job.ts   # 글 수정 배치
├── modify-article-processor.ts # 수정 처리기
├── modify-query-utils.ts # 수정 대상 쿼리 (manual-post에서도 사용)
│
│  # UI
├── post-options-ui.tsx   # 발행 옵션 UI (viral, manual-post에서 재사용)
├── account-list-ui.tsx   # 계정 목록 UI
├── api-test-ui.tsx       # API 테스트 UI (394줄)
├── keyword-generator-ui.tsx # 키워드 생성 UI
├── queue-dashboard-ui.tsx # 큐 대시보드 (658줄)
├── queue-status-ui.tsx   # 큐 상태 표시
├── queue-actions.ts      # 큐 관리 server actions
└── random.ts             # 랜덤 유틸리티
```

## WHERE TO LOOK

| Task | File | Key Function |
|------|------|-------------|
| 배치 시작 | `batch-queue.ts` | `addBatchToQueue(input)` — 키워드→PostJobData→큐 |
| 단일 키워드 처리 | `keyword-processor.ts` | 콘텐츠 생성→발행→댓글→답글 파이프라인 |
| 글 작성 | `post-writer.ts` | `writePostWithAccount()` — Playwright DOM 조작 |
| 이미지 업로드 | `image-uploader.ts` | Base64 → 에디터 삽입 |
| 카페 가입 | `cafe-join.ts` | `joinCafeWithAccount()` — 자동 가입 |
| 닉네임 변경 | `nickname-changer.ts` | 배치 닉네임 변경 |
| 큐 모니터링 | `queue-dashboard-ui.tsx` | Bull Board 대안 UI |
| 발행 옵션 | `types.ts` | `PostOptions` — 댓글/스크랩/CCL 설정 |

## KEY TYPES (다른 모듈에서 사용)

```typescript
PostOptions      // 발행 옵션 (댓글/스크랩/복사/CCL)
ProgressCallback // 배치 진행상황 콜백
BatchProgress    // 진행상황 데이터 (phase, message)
DelayConfig      // 딜레이 설정 (afterPost, betweenComments 등)
BatchJobInput    // 배치 입력 (service, keywords, options)
BatchJobResult   // 배치 결과 (success, completed, failed)
```

## CONVENTIONS

- 계정 선택: round-robin (`accounts[i % accounts.length]`)
- 딜레이: DB 설정 기반 (`getQueueSettings()` → `getRandomDelay()`)
- 키워드 파싱: `keyword:category` 형식 지원 (`parseKeywordWithCategory`)
- 에러 처리: `{ success: false, error: '...' }` 반환

## ANTI-PATTERNS

### ⛔ CRITICAL
1. **shared에서 types.ts import**: `shared/lib/queue/types.ts` → `PostOptions` — 순환 의존
2. **사실상 shared lib**: 28 exports, 5+ 모듈에서 소비 — features/ 위치 부적합

### ⚠️ GOTCHAS
1. **post-writer.ts DOM 의존**: 네이버 에디터 DOM 변경 시 즉시 깨짐
2. **batch-job.ts는 레거시**: 직렬 처리 — 새 코드는 `batch-queue.ts` (큐 기반) 사용
3. **DEFAULT_DELAYS vs DB 설정**: `types.ts`의 하드코딩 vs `queue-settings` MongoDB. **DB 우선**
4. **이미지 크기**: Base64 이미지 → Server Action 500mb 제한 주의
5. **cafe-join 실패 조용함**: 이미 가입된 카페 → 에러 로그만, 예외 없음
