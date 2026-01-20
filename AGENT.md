# Cafe Bot - 네이버 카페 자동화 봇

## 프로젝트 개요
네이버 카페 자동 글/댓글 발행 봇. Playwright 기반 브라우저 자동화와 BullMQ 작업 큐를 활용한 배치 처리 시스템.

## 기술 스택

### Core
- **Framework**: Next.js 16.1.1 (App Router)
- **React**: 19.2.3
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4

### 인프라
- **Database**: MongoDB (Mongoose 9)
- **Queue**: BullMQ + Redis (ioredis)
- **Browser Automation**: Playwright
- **Auth**: next-auth 5 (beta)

### 유틸리티
- clsx, tailwind-merge (스타일링)
- Bull Board (큐 모니터링)

## 아키텍처
FSD (Feature-Sliced Design) 기반 구조

```
src/
├── app/                  # Next.js App Router
│   ├── accounts/         # 계정 관리 페이지
│   ├── api/              # API 라우트
│   │   ├── auth/         # 인증 API
│   │   ├── accounts/     # 계정 API
│   │   └── cafes/        # 카페 API
│   ├── batch/            # 배치 작업 페이지
│   ├── cafe-join/        # 카페 가입 페이지
│   ├── comment-test/     # 댓글 테스트
│   ├── login/            # 로그인 페이지
│   ├── manuscript/       # 원고 관리
│   ├── nickname-change/  # 닉네임 변경
│   ├── publish/          # 발행 페이지
│   ├── queue/            # 큐 관리 페이지
│   ├── settings/         # 설정 페이지
│   ├── test/             # 테스트 페이지
│   └── viral/            # 바이럴 마케팅
│       └── debug/        # 바이럴 디버그
│
├── entities/             # 비즈니스 엔티티
│   ├── account/          # 계정 엔티티
│   ├── cafe/             # 카페 엔티티
│   └── queue/            # 큐 엔티티
│
├── features/             # 기능 모듈
│   ├── accounts/         # 계정 관리 기능
│   ├── auto-comment/     # 자동 댓글 시스템
│   │   ├── batch/        # 배치 처리 로직
│   │   └── publish/      # 발행 기능
│   ├── comment/          # 댓글 기능
│   ├── post-article/     # 글 발행 기능
│   ├── settings/         # 설정 기능
│   ├── test/             # 테스트 기능
│   └── viral/            # 바이럴 마케팅 기능
│
├── shared/               # 공유 모듈
│   ├── api/              # API 클라이언트
│   ├── config/           # 설정 파일
│   ├── lib/              # 유틸리티
│   │   ├── queue/        # BullMQ 큐 관리
│   │   │   ├── handlers/ # 작업 핸들러
│   │   │   ├── index.ts  # 큐 생성/관리
│   │   │   ├── workers.ts # 워커 관리
│   │   │   ├── sequence.ts # 시퀀스 처리
│   │   │   └── types.ts  # 큐 타입 정의
│   │   ├── account-manager.ts
│   │   ├── multi-session.ts
│   │   ├── playwright.ts
│   │   ├── mongodb.ts
│   │   └── redis.ts
│   ├── models/           # Mongoose 모델
│   ├── types/            # 타입 정의
│   └── ui/               # 공통 UI 컴포넌트
│
└── widgets/              # 조합된 UI 블록
```

## 데이터 모델

| 모델 | 설명 |
|------|------|
| Account | 네이버 계정 정보 |
| Cafe | 카페 정보 |
| PublishedArticle | 발행된 글 |
| ModifiedArticle | 수정된 글 |
| BatchJobLog | 배치 작업 로그 |
| DailyPostCount | 일일 발행 횟수 |
| DailyActivity | 일일 활동 기록 |
| QueueSettings | 큐 설정 |

## 개발 규칙

### 네이밍
- **파일**: kebab-case (`cafe-api.ts`)
- **컴포넌트**: PascalCase (`PostForm.tsx`)
- **함수/변수**: camelCase
- **타입**: PascalCase

### 코드 스타일
- 구조분해할당 필수
- Server Actions 사용 (`"use server"`)
- 불필요한 주석 금지
- React 19 기능 활용 (useOptimistic, use)

### Import Alias
```typescript
import { something } from "@/shared/lib/..."
```

## 실행 명령어

```bash
# 개발 서버 (port 3007) + Bull Board 동시 실행
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
# MongoDB
MONGODB_URI=

# Redis
REDIS_URL=

# Naver OAuth
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Cafe Config
NAVER_CAFE_ID=
NAVER_CAFE_MENU_ID=

# Content Generation API
CONTENT_API_URL=
```

## 주요 기능

### 1. 계정 관리
- 다중 네이버 계정 관리
- Playwright 세션 관리
- 계정별 활동 추적

### 2. 자동 댓글
- 키워드 기반 댓글 생성
- 배치 처리 시스템
- 활동 시간대 스케줄링

### 3. 글 발행
- 원고 기반 자동 발행
- 카페 메뉴별 발행

### 4. 큐 시스템
- BullMQ 기반 작업 큐
- 계정별 Task 큐 분리
- 작업 타입: post, comment, reply, generate
- 시퀀스 처리 지원 (순차 작업)
- 중복 Job 방지 (jobId 기반)
- 재시도 로직 (exponential backoff)
- Bull Board로 모니터링

### 5. 바이럴 마케팅
- 네이버 인기글 파싱
- AI 기반 콘텐츠 생성
- 배치 작업 처리
