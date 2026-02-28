# APP — Next.js App Router

**Generated:** 2026-02-26

## OVERVIEW

Next.js 16 App Router 기반 페이지 및 API 라우트. FSD 아키텍처에서 pages 역할. /viral이 메인, 루트는 /viral로 리다이렉트.

## STRUCTURE

```
app/
├── api/                    # REST API endpoints
│   ├── auth/              # 로그인/회원가입/로그아웃
│   ├── accounts/          # 계정 CRUD
│   ├── cafes/             # 카페 CRUD
│   ├── viral/
│   │   └── batch/         # 바이럴 배치 실행 (POST)
│   └── queue/             # 큐 상태 API
├── accounts/              # 계정 관리 페이지
├── cafe-join/             # 카페 가입 테스트
├── comment-test/          # 댓글 작성 테스트
├── login/                 # 로그인 페이지
├── manual-post/           # 수동 발행
├── manuscript/            # 원고 관리
├── nickname-change/       # 닉네임 변경
├── page.tsx               # 루트 → /viral 리다이렉트
├── publish/               # 원고 발행
├── queue/                 # 큐 모니터링
├── settings/              # 설정 (딜레이, 계정)
├── test/                  # 테스트 도구
└── viral/                 # ★ 메인 — 바이럴 배치 UI
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 루트 리다이렉트 | `page.tsx` | `redirect('/viral')` |
| API 엔드포인트 | `api/*/route.ts` | RESTful route handlers |
| 바이럴 배치 API | `api/viral/batch/route.ts` | POST → viral-batch-job.ts |
| 계정 API | `api/accounts/route.ts` | GET/POST/PUT/DELETE |
| 큐 상태 API | `api/queue/route.ts` | BullMQ 직접 조회 |

## CONVENTIONS

### Route Handler Pattern
```typescript
// app/api/*/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // ...
  return NextResponse.json(data);
}
```

### Page Pattern
```typescript
// app/*/page.tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <Suspense>
      <MainUI />
    </Suspense>
  );
}
```

### Layout
- `layout.tsx` - 루트 레이아웃 (global CSS, providers)
- Client components marked with `'use client'`

## ANTI-PATTERNS

- **API route에서 직접 DB 접근**: 반드시 entity server actions 사용
- **Page에서 직접 fetch**: Server component에서 직접 `fetch()` 대신 Server Action 호출
- **API route 중복**: 이미 features/에 server action 있는 경우 API route 불필요

## NOTES

- Dev port: **3007** (next.config.ts)
- Server Actions body limit: **500mb** (이미지 업로드용)
- Bull Board proxy: `/queue/*` → `localhost:3008/*`
- Auth: cookie-based userId (next-auth 의존성 있지만 실제로는 미사용)
