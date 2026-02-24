# Viro - 네이버 카페 바이럴 자동화 플랫폼

## 프로젝트 개요
네이버 카페 자동 글/댓글 발행 봇. Playwright 기반 브라우저 자동화와 BullMQ 작업 큐를 활용한 배치 처리 시스템.
앱 이름: **Viro** (Viral + Auto)

## 기술 스택

### Core
- **Framework**: Next.js 16.1.1 (App Router)
- **React**: 19.2.3
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4

### 인프라
- **Database**: MongoDB (Mongoose 9)
- **Queue**: BullMQ 5 + Redis (ioredis 5)
- **Browser Automation**: Playwright 1.57
- **Auth**: next-auth 5 (beta)

### UI/UX
- clsx + tailwind-merge (스타일링)
- Framer Motion 12 (애니메이션)
- Sonner 2 (토스트 알림)
- Lottie React (애니메이션 에셋)
- JetBrains Mono (폰트)

### 상태 관리
- **Jotai 2** (클라이언트 상태)
- Server Actions (서버 상태 변경)

### 개발 도구
- Bull Board (큐 모니터링, port 3008)
- concurrently (dev 서버 + bull-board 동시 실행)

## 아키텍처
FSD (Feature-Sliced Design) 기반 구조

```
src/
├── app/                  # Next.js App Router (pages + API routes)
│   ├── api/
│   │   ├── auth/         # next-auth 인증 API
│   │   ├── accounts/     # 계정 CRUD API
│   │   ├── cafes/        # 카페 API
│   │   └── viral/        # 바이럴 API
│   ├── accounts/         # 계정 관리 페이지
│   ├── cafe-join/        # 카페 가입 페이지
│   ├── comment-test/     # 댓글 테스트 페이지
│   ├── login/            # 로그인 페이지
│   ├── manual-post/      # 수동 발행 페이지
│   ├── manuscript/       # 원고 관리 페이지
│   ├── nickname-change/  # 닉네임 변경 페이지
│   ├── publish/          # 발행 페이지
│   ├── queue/            # 큐 관리 페이지
│   ├── settings/         # 설정 페이지
│   ├── test/             # 테스트 페이지
│   └── viral/            # 바이럴 마케팅 메인 (기본 리다이렉트 대상)
│
├── entities/             # 비즈니스 엔티티 (데이터 + API)
│   ├── account/
│   ├── cafe/
│   ├── queue/
│   └── store/
│
├── features/             # 기능 모듈 (UI + Actions)
│   ├── accounts/         # 계정 관리 (account-manager-ui, cafe-manager-ui)
│   ├── auth/             # 인증 (auth-guard, actions)
│   ├── auto-comment/     # 자동 댓글 시스템
│   ├── comment/          # 댓글 기능
│   ├── manual-post/      # 수동 발행
│   ├── post-article/     # 글 발행 (post-form, actions)
│   ├── settings/         # 설정 (delay-ui, actions)
│   ├── test/             # 테스트 기능
│   └── viral/            # 바이럴 마케팅 (parser, batch, debug)
│
├── shared/               # 공유 모듈
│   ├── api/              # 외부 API 클라이언트
│   │   ├── naver-cafe-api.ts
│   │   ├── naver-comment-api.ts
│   │   ├── content-api.ts
│   │   ├── comment-gen-api.ts
│   │   ├── keyword-gen-api.ts
│   │   └── google-image-api.ts
│   ├── config/           # 설정 파일 (accounts, cafes, user)
│   ├── hooks/            # 커스텀 훅 (use-delay-settings)
│   ├── lib/              # 핵심 유틸리티
│   │   ├── queue/        # BullMQ 큐 시스템
│   │   │   ├── handlers/ # 작업 핸들러
│   │   │   ├── index.ts  # 큐 생성/관리
│   │   │   ├── workers.ts
│   │   │   ├── sequence.ts
│   │   │   └── types.ts
│   │   ├── account-manager.ts
│   │   ├── multi-session.ts
│   │   ├── playwright.ts
│   │   ├── mongodb.ts
│   │   ├── redis.ts
│   │   ├── auth.ts
│   │   ├── cn.ts
│   │   └── toast.ts
│   ├── models/           # Mongoose 모델
│   │   ├── account.ts
│   │   ├── cafe.ts
│   │   ├── user.ts
│   │   ├── published-article.ts
│   │   ├── modified-article.ts
│   │   ├── batch-job-log.ts
│   │   ├── daily-activity.ts
│   │   ├── daily-post-count.ts
│   │   ├── queue-settings.ts
│   │   └── viral-response.ts
│   ├── store/            # Jotai atoms (user-atom)
│   ├── types/            # 공통 타입 정의
│   ├── providers.tsx     # JotaiProvider + AuthGuard
│   └── ui/               # 공통 UI 컴포넌트
│       ├── animated-button.tsx
│       ├── animated-card.tsx
│       ├── animated-tabs.tsx
│       ├── app-header.tsx
│       ├── button.tsx
│       ├── checkbox.tsx
│       ├── confirm-modal.tsx
│       ├── loading-dots.tsx
│       ├── page-layout.tsx
│       ├── page-transition.tsx
│       ├── select.tsx
│       └── theme-toggle.tsx
│
└── widgets/              # 조합된 UI 블록 (현재 미사용)
```

## 데이터 모델 (Mongoose)

| 모델 | 설명 |
|------|------|
| Account | 네이버 계정 정보 |
| Cafe | 카페 정보 |
| User | 앱 사용자 |
| PublishedArticle | 발행된 글 |
| ModifiedArticle | 수정된 글 |
| BatchJobLog | 배치 작업 로그 |
| DailyPostCount | 일일 발행 횟수 |
| DailyActivity | 일일 활동 기록 |
| QueueSettings | 큐 설정 |
| ViralResponse | 바이럴 응답 |

## 개발 규칙

### 네이밍
- **파일**: kebab-case (`cafe-api.ts`, `post-form.tsx`)
- **컴포넌트**: PascalCase
- **함수/변수**: camelCase
- **타입/인터페이스**: PascalCase

### 코드 스타일
- 구조분해할당 필수
- 화살표 함수 사용 (`const fn = () => {}`)
- Server Actions 사용 (`"use server"`)
- 불필요한 주석 금지
- React 19 기능 활용 (useOptimistic, use)
- 절대 경로 import (`@/shared/...`)

### 상태 관리 패턴
- 서버 상태 변경: Server Actions
- 클라이언트 상태: Jotai atoms (`@/shared/store`)
- 토스트 알림: `@/shared/lib/toast` (Sonner 래퍼)

### 큐 시스템 패턴
- 작업 타입: `post`, `comment`, `reply`, `generate`
- 계정별 Task 큐 분리
- 시퀀스 처리 지원 (순차 작업)
- 중복 Job 방지 (jobId 기반)
- 재시도 로직 (exponential backoff)

## 실행 명령어

```bash
# 개발 서버 (Next.js port 3007 + Bull Board port 3008)
npm run dev

# Next.js만 실행
npm run dev:next

# 빌드
npm run build

# 프로덕션 서버
npm run start

# 린트
npm run lint

# Bull Board (큐 모니터링)
npm run bull-board
```

## 환경 변수

```env
# Naver OAuth
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Cafe Config
NAVER_CAFE_ID=
NAVER_CAFE_MENU_ID=

# Content Generation API
CONTENT_API_URL=http://localhost:8000

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# MongoDB (Atlas 권장)
MONGODB_URI=

# Redis
REDIS_URL=
```

## 주요 기능

### 1. 계정 관리
- 다중 네이버 계정 관리
- Playwright 세션 관리 (multi-session)
- 계정별 활동 추적

### 2. 자동 댓글
- 키워드 기반 댓글 생성
- 배치 처리 시스템
- 활동 시간대 스케줄링

### 3. 글 발행
- 원고 기반 자동 발행
- 카페 메뉴별 발행
- 수동 발행 지원

### 4. 큐 시스템 (BullMQ)
- 계정별 Task 큐 분리
- Bull Board 모니터링 (port 3008, `/queue` 경로로 프록시)
- 시퀀스 처리 지원

### 5. 바이럴 마케팅
- 네이버 인기글 파싱 (`viral-parser.ts`)
- AI 기반 콘텐츠 생성 (`viral-prompt.ts`)
- 배치 작업 처리 (`viral-batch-job.ts`)
- 디버그 UI 제공

## 주의사항

### DB 마이그레이션
**중요: 마이그레이션 스크립트 실행 시 반드시 Atlas URI 명시**

로컬 MongoDB가 아닌 Atlas에 마이그레이션해야 함:
```bash
# 잘못된 방법 (로컬 DB에 적용됨)
npx tsx scripts/migrate-xxx.ts

# 올바른 방법 (Atlas에 적용)
MONGODB_URI="mongodb+srv://..." npx tsx scripts/migrate-xxx.ts
```

### Next.js 설정
- `serverActions.bodySizeLimit`: 500mb (대용량 이미지 처리)
- `/queue/:path*` → `http://localhost:3008/:path*` 프록시 설정

### 스크립트 (`scripts/`)
- 마이그레이션, 큐 관리, 계정 삽입 등 유틸리티 스크립트 모음
- `npx tsx scripts/[파일명].ts` 로 실행
