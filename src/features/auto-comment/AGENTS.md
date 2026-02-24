# features/auto-comment — Auto-Comment God Module

## OVERVIEW

자동 글/댓글/답글 발행 시스템. batch/(25 files)와 publish/(8 files) 하위 모듈 포함. 28+ exports로 viral, manual-post 등 5개 이상 모듈에서 소비됨.

## STRUCTURE

```
auto-comment/
├── index.ts                 # barrel (28 exports)
├── actions.ts               # 기본 actions
├── account-actions.ts       # 계정 CRUD server actions
├── auto-post-actions.ts     # 단건 발행 server actions
├── auto-post-form.tsx       # 단건 발행 폼 UI
├── auto-post-ui.tsx         # 단건 발행 페이지 UI
├── account-manager-form.tsx # 계정 관리 폼
├── account-manager-list.tsx # 계정 목록
├── account-manager-ui.tsx   # 계정 관리 통합 UI
├── comment-writer.ts        # ★ 498줄 — Playwright 댓글 작성 (DOM 조작)
├── comment-delay.ts         # 댓글 딜레이 계산
├── batch/                   # → 별도 AGENTS.md (25 files, 배치 처리)
└── publish/                 # 원고 발행 서브시스템
    ├── index.ts             # barrel
    ├── actions.ts           # 원고 발행 server actions (298줄)
    ├── manuscript-actions.ts # 원고 CRUD (275줄)
    ├── queue-actions.ts     # 큐 관리
    ├── types.ts             # Manuscript 타입
    ├── comment-only-ui.tsx  # 댓글만 발행 UI
    ├── post-only-ui.tsx     # 글만 발행 UI
    └── manuscript-upload-ui.tsx # 원고 업로드 UI (464줄)
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| 댓글 작성 핵심 | `comment-writer.ts` | Playwright DOM 조작, 로그인, 프레임 탐색 |
| 배치 발행 | `batch/` | → `batch/AGENTS.md` |
| 원고 발행 | `publish/actions.ts` | 원고→큐 변환, 워커 시작 |
| 원고 관리 | `publish/manuscript-actions.ts` | CRUD + 발행 상태 관리 |
| 단건 발행 | `auto-post-actions.ts` | 글 1개 + 댓글 N개 직접 발행 |

## KEY EXPORTS (다른 모듈에서 사용)

```typescript
// Types — viral, manual-post에서 import
PostOptions, ProgressCallback, BatchProgress, DelayConfig, ReplyStrategy

// Functions — manual-post에서 import
writePostWithAccount, modifyArticleWithAccount, addBatchToQueue

// UI — viral, manual-post에서 import
PostOptionsUI, AccountListUI, KeywordGeneratorUI

// Server Actions — app pages에서 import
runBatchPostAction, testSingleKeywordAction, runModifyBatchAction
```

## ANTI-PATTERNS

### ⛔ CRITICAL
1. **God module**: 28+ exports, 44 files — 실질적으로 shared lib이지만 features/ 아래 위치
2. **Cross-feature coupling**: manual-post, viral이 batch/ 내부 타입/유틸에 직접 의존
3. **comment-writer.ts DOM 의존성**: 네이버 카페 DOM 변경 시 즉시 깨짐

### ⚠️ GOTCHAS
1. **comment-writer.ts 세션 관리**: `acquireAccountLock` → 작업 → `releaseAccountLock` 반드시 쌍으로
2. **publish/actions.ts**: `startAllTaskWorkers()` 호출 포함 — 워커가 없으면 자동 시작
3. **Naming 불일치**: `auto-post-form.tsx` vs `*-ui.tsx` 패턴 혼재
