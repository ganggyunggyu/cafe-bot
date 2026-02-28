# SCRIPTS — Utility Scripts

**Generated:** 2026-02-26

## OVERVIEW

CLI 유틸리티 및 관리 스크립트 모음. 34개 스크립트. npx tsx로 실행. MongoDB Atlas 연결 시 환경변수 필요.

## STRUCTURE

```
scripts/
├── Queue Management          # 큐 조회/관리
│   ├── bull-board.ts         # BullMQ 대시보드 standalone
│   ├── check-queues.ts       # 큐 상태 간단 조회
│   ├── clear-queues.ts       # 모든 큐 초기화
│   ├── drain-all-queues.ts   # 큐 비우기 (drain)
│   ├── queue-clean.ts        # 특정 카페 큐 정리
│   ├── queue-side-activity.ts # ★ 사이드 활동 배치 실행
│   ├── queue-today-report.ts # 오늘 큐 실행 리포트
│   ├── restart-workers.ts    # 워커 재시작
│   ├── retry-completed-posts.ts # 완료된 글 재처리
│   └── retry-failed-jobs.ts  # 실패 Job 재시도
│
├── Batch Campaigns           # 캠페인 실행
│   ├── run-campaign.ts       # ★ 메인 캠페인 배치
│   ├── run-writer-side-activity.ts # 작가 사이드 활동
│   ├── schedule-chanel-activity.ts # 샤넬 활동 스케줄
│   └── warmup-cafe-writers.ts # 카페 작가 예열
│
├── Data Operations           # 데이터 조작
│   ├── check-accounts.ts     # 계정 상태 확인
│   ├── check-db.ts           # DB 연결 테스트
│   ├── check-latest.ts       # 최신 글/댓글 확인
│   ├── insert-accounts.mjs   # 계정 일괄 삽입
│   └── update-roles.ts       # 계정 역할 업데이트
│
├── Viral Content             # 바이럴 콘텐츠
│   ├── add-viral-tasks.ts    # 바이럴 태스크 추가
│   ├── gen-viral-prompt.ts   # 바이럴 프롬프트 생성
│   └── test-viral-queue.ts   # 바이럴 큐 테스트
│
├── Testing & Debug           # 테스트
│   ├── parse-comment-test.ts # 댓글 파싱 테스트
│   ├── test-gemini-comment.ts # Gemini 댓글 테스트
│   ├── test-keyword.ts       # 키워드 테스트
│   └── test-new-features.ts  # 신기능 테스트
│
└── Migrations                # DB 마이그레이션
    ├── migrate-add-userid.ts # userId 필드 추가
    ├── migrate-user-id.ts    # 사용자 ID 마이그레이션
    └── migrate-persona.mjs   # 페르소나 마이그레이션
```

## WHERE TO LOOK

| Task | Script | Notes |
|------|--------|-------|
| 큐 상태 확인 | `check-queues.ts` | Redis 연결 필요 |
| 큐 전체 삭제 | `clear-queues.ts` | ⚠️ 위험 — 모든 작업 삭제 |
| 캠페인 실행 | `run-campaign.ts` | 메인 배치 실행 |
| 사이드 활동 | `queue-side-activity.ts` | 댓글/좋아요 활동 |
| 계정 확인 | `check-accounts.ts` | 로그인 상태 체크 |
| DB 마이그레이션 | `migrate-*.ts` | Atlas URI 필요 |
| 프롬프트 생성 | `gen-viral-prompt.ts` | AI 프롬프트 테스트 |

## CONVENTIONS

### Script Pattern
```typescript
#!/usr/bin/env tsx
import { connectDB } from '@/shared/lib/mongodb';

async function main() {
  await connectDB();
  // ... 작업
}

main().catch(console.error);
```

### MongoDB Atlas 실행
```bash
# 로컬 DB
npx tsx scripts/script-name.ts

# Atlas
MONGODB_URI="mongodb+srv://..." npx tsx scripts/script-name.ts
```

### Error Handling
- 스크립트는 `throw`필도 됨 (CLI 환경)
- `console.error()`로 실패 출력
- `process.exit(1)`로 비정상 종료

## ANTI-PATTERNS

- **스크립트에서 UI import**: 순수 Node.js 환경, React 사용 불가
- **스크립트에서 `.env.local` 자동 로드**: 명시적 MONGODB_URI 필요
- **스크립트에서 server action 호출**: server action은 HTTP context 필요

## NOTES

- `.mjs` 확장자는 ESM-only 스크립트
- `bull-board.ts`는 standalone 서버 (:3008)
- 마이그레이션은 한 번만 실행 (idempotent design)
- 대부분의 스크립트는 `shared/config/accounts.ts` 사용 (DB-backed)
