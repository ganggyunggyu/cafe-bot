# VIRO — PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-24
**Commit:** d787d45
**Branch:** main

## OVERVIEW

네이버 카페 바이럴 자동화 플랫폼. Next.js 16 App Router + Playwright 브라우저 자동화 + BullMQ 작업 큐 + MongoDB/Redis 인프라. FSD(Feature-Sliced Design) 변형 아키텍처.

## STRUCTURE

```
src/
├── app/                # Next.js App Router — pages + API routes
│   ├── api/            # REST endpoints (auth, accounts, cafes, viral)
│   └── {page}/         # Page routes (viral이 메인, / → /viral 리다이렉트)
├── entities/           # 3-layer entity pattern (model/ + api/ + index.ts)
│   ├── account/        # NaverAccount CRUD (server actions)
│   ├── cafe/           # CafeConfig CRUD (server actions)
│   ├── queue/          # BullMQ queue status (Redis 직접)
│   └── store/          # Jotai atoms (postOptions, cafes)
├── features/           # Feature modules (UI + Actions)
│   ├── auto-comment/   # ★ GOD MODULE — batch/, publish/ 포함, 28+ exports
│   ├── viral/          # AI 바이럴 — parser, prompt, batch, debug
│   ├── manual-post/    # 수동 발행 (auto-comment/batch에 의존)
│   ├── accounts/       # 계정/카페 관리 UI (entity facade)
│   ├── auth/           # 인증 (login, register, AuthGuard)
│   ├── comment/        # 댓글 발행 (self-contained)
│   ├── post-article/   # 글 발행 (self-contained)
│   ├── settings/       # 큐 딜레이 설정
│   └── test/           # 테스트 UI
├── shared/             # 공유 계층
│   ├── api/            # 외부 API 클라이언트 (네이버, 콘텐츠생성, 구글이미지)
│   ├── config/         # DB-backed 설정 (accounts.ts, cafes.ts, user.ts)
│   ├── lib/            # ★ CORE INFRA — queue/, mongodb, redis, playwright, multi-session
│   ├── models/         # Mongoose 스키마 11개 + helper functions
│   ├── store/          # Jotai atoms (user)
│   ├── types/          # Naver API 타입
│   └── ui/             # 공통 UI 18개 (animated-*, button, modal 등)
└── widgets/            # 미사용
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 글 발행 로직 | `shared/lib/queue/handlers/post-handler.ts` | 542줄, 댓글/답글 체이닝 포함 |
| 큐/워커 시스템 | `shared/lib/queue/` | → `AGENTS.md` 참조 |
| 브라우저 자동화 | `shared/lib/multi-session.ts` | per-account context, lock 관리 |
| 배치 처리 | `features/auto-comment/batch/` | → `AGENTS.md` 참조, 25 files |
| 바이럴 콘텐츠 | `features/viral/` | → `AGENTS.md` 참조, AI 프롬프트 |
| 인증 흐름 | `features/auth/` | Server Action 기반, cookie userId |
| Mongoose 스키마 | `shared/models/` | barrel: `shared/models/index.ts` |
| 계정 데이터소스 | `shared/config/accounts.ts` | MongoDB-backed (NOT account-manager.ts) |
| 카페 데이터소스 | `shared/config/cafes.ts` | MongoDB-backed |
| Jotai 상태 | `entities/store/` + `shared/store/` | postOptions, cafes, user |
| UI 컴포넌트 | `shared/ui/index.ts` | barrel export |

## CODE MAP — KEY SYMBOLS

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `addTaskJob` | function | shared/lib/queue/index.ts | 큐에 작업 추가 (dedup 포함) |
| `processTaskJob` | function | shared/lib/queue/workers.ts | 워커 잡 처리 진입점 |
| `handlePostJob` | function | shared/lib/queue/handlers/post-handler.ts | 글 발행 + 댓글 체이닝 |
| `waitForSequenceTurn` | function | shared/lib/queue/sequence.ts | Redis 기반 순서 보장 |
| `getPageForAccount` | function | shared/lib/multi-session.ts | per-account 브라우저 페이지 |
| `acquireAccountLock` | function | shared/lib/multi-session.ts | 계정별 mutex |
| `connectDB` | function | shared/lib/mongodb.ts | Mongoose 캐시 연결 |
| `getRedisConnection` | function | shared/lib/redis.ts | ioredis 싱글톤 |
| `getAllAccounts` | function | shared/config/accounts.ts | MongoDB에서 계정 로드 |
| `writePostWithAccount` | function | features/auto-comment/batch/post-writer.ts | Playwright로 글 작성 |
| `addBatchToQueue` | function | features/auto-comment/batch/batch-queue.ts | 키워드→큐 변환 |

## CONVENTIONS

### Naming
- Files: `kebab-case.ts` — Components: `PascalCase` — Functions: `camelCase`
- Client components: `*-ui.tsx` suffix (프로젝트 고유)
- Server actions: `actions.ts` or `*-actions.ts`

### Code Style (THIS PROJECT)
- Arrow functions ONLY (`const fn = () => {}`)
- Destructuring ALWAYS
- Absolute imports ONLY (`@/shared/...`)
- Named handlers (no inline anonymous)
- Server Actions return `{ success: boolean; error?: string }` — NEVER throw

### Error Handling
- `[MODULE_NAME]` prefix on all console.log/error
- `error instanceof Error ? error.message : '...'` pattern
- DB errors non-fatal in handlers (log + continue)
- `bufferCommands: false` — MongoDB queries fail immediately if disconnected

### State Management
- Server state: Server Actions (`'use server'`)
- Client state: Jotai atoms
- Toast: `@/shared/lib/toast` (Sonner wrapper)

## ANTI-PATTERNS (THIS PROJECT)

### ⛔ CRITICAL
1. **Account source divergence**: `shared/lib/account-manager.ts` reads JSON files, `shared/config/accounts.ts` reads MongoDB. Workers use config/, features mixed. **USE `shared/config/accounts.ts` for DB-backed**
2. **Circular dependency**: `shared/lib/queue/types.ts` imports from `features/auto-comment/batch/types.ts` — shared depends on feature
3. **Cross-feature imports**: `manual-post` → `auto-comment/batch`, `viral` → `auto-comment/batch` — 18+ instances
4. **auto-comment/batch is a shared lib masquerading as a feature** — 28 exports consumed by 5+ modules

### ⚠️ GOTCHAS
1. **Sequence timeout breaks ordering**: Job waits >30s → reschedules WITHOUT sequence → subsequent out of order
2. **Duplicate job silent skip**: Same jobId in waiting/delayed/active → silently ignored, no log
3. **Browser lock is promise-based**: Not truly atomic, can race under concurrent requests
4. **Idle cleanup races**: Background interval closes contexts while operations may be active
5. **playwright.ts is DEPRECATED**: Use `multi-session.ts` exclusively
6. **`widgets/` is empty**: Don't create files there
7. **MongoDB migrations**: MUST specify Atlas URI explicitly — `.env.local` not auto-loaded by scripts

## COMMANDS

```bash
npm run dev           # Next.js :3007 + Bull Board :3008
npm run dev:next      # Next.js only
npm run build         # Production build
npm run start         # Production :3007
npm run lint          # ESLint
npm run bull-board    # Queue monitoring standalone

# Scripts
npx tsx scripts/[name].ts                           # Local DB
MONGODB_URI="mongodb+srv://..." npx tsx scripts/[name].ts  # Atlas
```

## NOTES

- Dev port: **3007** (not default 3000)
- Bull Board proxy: `/queue/*` → `localhost:3008/*` (next.config.ts rewrites)
- Server Actions body limit: **500mb** (for image uploads)
- `USE_STATIC_ACCOUNTS = false` in account-manager.ts (dynamic mode)
- Auth: cookie-based userId (NOT next-auth despite dependency)
- Redis DB: index 1 (`redis://localhost:6379/1`)
- Worker concurrency: 1 per account task queue, 3 for generate queue
- Worker lock: 10min duration, 30s renewal, 2min stalled check

## SUBDIRECTORY AGENTS

| Path | Scope |
|------|-------|
| `src/shared/lib/AGENTS.md` | Core infrastructure (DB, Redis, Playwright, sessions) |
| `src/shared/lib/queue/AGENTS.md` | BullMQ queue system (workers, handlers, sequence) |
| `src/features/auto-comment/AGENTS.md` | Auto-comment god module (batch, publish) |
| `src/features/auto-comment/batch/AGENTS.md` | Batch processing system (25 files) |
| `src/features/viral/AGENTS.md` | Viral marketing (parser, AI prompts, batch) |
