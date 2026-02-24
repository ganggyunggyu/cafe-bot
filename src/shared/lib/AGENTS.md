# shared/lib — Core Infrastructure

## OVERVIEW

DB, Redis, Playwright 브라우저, 계정 관리 등 핵심 인프라 유틸리티 모음. 모든 features/에서 의존.

## STRUCTURE

```
lib/
├── queue/              # → 별도 AGENTS.md (BullMQ 시스템)
├── mongodb.ts          # Mongoose 캐시 연결 (global cache, bufferCommands: false)
├── redis.ts            # ioredis 싱글톤 (DB index 1)
├── multi-session.ts    # ★ per-account 브라우저 세션 관리 (291줄)
├── playwright.ts       # ⚠️ DEPRECATED — multi-session.ts 사용
├── account-manager.ts  # 계정 로드 + 활동시간 관리 (JSON 기반)
├── auth.ts             # 인증 유틸리티
├── cafe-content.ts     # 카페 콘텐츠 빌더
├── cn.ts               # clsx + tailwind-merge 래퍼
├── toast.ts            # Sonner 토스트 래퍼
├── random.ts           # 랜덤 유틸리티
├── adb-controller.ts   # ADB 컨트롤러 (모바일)
└── ip-changer.ts       # IP 변경 유틸리티
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| DB 연결 | `mongodb.ts` | `connectDB()` — global cache, 30s server timeout |
| Redis 연결 | `redis.ts` | `getRedisConnection()` — 싱글톤, `maxRetriesPerRequest: null` |
| 브라우저 페이지 | `multi-session.ts` | `getPageForAccount(id)` — per-account context |
| 계정 잠금 | `multi-session.ts` | `acquireAccountLock()` / `releaseAccountLock()` |
| 로그인 확인 | `multi-session.ts` | `isAccountLoggedIn()` — 30분 TTL 캐시 |
| 활동시간 체크 | `account-manager.ts` | `isAccountActive()` — 시간+요일 검사 |

## CONVENTIONS

- 연결 패턴: **싱글톤/캐시** (mongodb global cache, redis let, browser globalThis)
- HMR 대응: `globalThis.__pw*` prefix로 상태 보존
- 로그 prefix: `[MONGODB]`, `[REDIS]`, `[BROWSER]`, `[LOCK]`, `[LOGIN]`, `[IDLE]`, `[ACCOUNTS]`

## ANTI-PATTERNS

### ⛔ CRITICAL
1. **playwright.ts 사용 금지**: `multi-session.ts` 전용. playwright.ts는 단일 세션만 지원하는 레거시
2. **account-manager.ts vs config/accounts.ts**: JSON 파일 읽기 vs MongoDB 읽기. **DB-backed 작업은 반드시 `shared/config/accounts.ts` 사용**

### ⚠️ GOTCHAS
1. **Browser lock 비원자적**: Promise 기반 → 동시 요청 시 race 가능
2. **Idle cleanup 경합**: 60초 간격 정리가 진행 중인 작업의 context 닫을 수 있음
3. **Login cache 무효화 안됨**: 비밀번호 변경 시 `invalidateLoginCache()` 수동 호출 필요
4. **MongoDB `bufferCommands: false`**: DB 끊기면 쿼리 즉시 실패 (버퍼링 없음)
5. **Redis 풀링 없음**: 모든 큐/워커가 단일 연결 공유

## KEY PATTERNS

### Multi-Session 생명주기
```
getBrowser() → 전역 1개
  └─ getContextForAccount(id) → 계정별 BrowserContext (쿠키 로드)
       └─ getPageForAccount(id) → 기존 페이지 재사용 or 신규
            └─ saveCookiesForAccount(id) → .playwright-session/{id}-cookies.json
```

### MongoDB 연결 캐시
```
connectDB() → global.mongooseCache.conn 체크
  └─ 없으면: mongoose.connect() + readyState 대기 (10s timeout)
  └─ 실패 시: 캐시 초기화 + throw
```
