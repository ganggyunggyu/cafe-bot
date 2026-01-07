# Cafe Bot - Naver Cafe Auto Posting Bot

## Project Overview
네이버 카페 자동 글 발행 봇. 원고 생성 API와 네이버 카페 API를 연동하여 자동으로 글을 작성한다.

## Tech Stack
- **Framework**: Next.js 16.1.1 (App Router, Turbopack)
- **React**: 19.2.3
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **State Management**: React 19 built-in (use, useOptimistic)

## Architecture
FSD (Feature-Sliced Design) 기반 구조

```
src/
├── app/              # Next.js App Router (pages, layouts, api routes)
├── entities/         # 비즈니스 엔티티 (Cafe, Account, Article)
├── features/         # 기능 모듈 (auth, post-article, generate-content)
├── shared/           # 공유 모듈
│   ├── api/          # API 클라이언트
│   ├── lib/          # 유틸리티 함수
│   ├── types/        # 공통 타입 정의
│   └── ui/           # 공통 UI 컴포넌트
└── widgets/          # 조합된 UI 블록
```

## Conventions

### Naming
- **파일**: kebab-case (예: `cafe-api.ts`)
- **컴포넌트**: PascalCase (예: `PostForm.tsx`)
- **함수/변수**: camelCase
- **타입/인터페이스**: PascalCase

### API Routes
- Route Handlers: `src/app/api/[feature]/route.ts`
- Server Actions: 각 feature 폴더 내 `actions.ts`

### Import Alias
- `@/*` -> `src/*`

## Environment Variables
```env
# Naver OAuth
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Cafe Config
NAVER_CAFE_ID=
NAVER_CAFE_MENU_ID=

# Content Generation API
CONTENT_API_URL=http://localhost:8000
```

## Key APIs

### 1. Naver Cafe API
- 가입: `POST https://openapi.naver.com/v1/cafe/{clubid}/members`
- 글쓰기: `POST https://openapi.naver.com/v1/cafe/{clubid}/menu/{menuid}/articles`
- 인증: Bearer Token (OAuth 2.0)

### 2. Content Generation API
- 원고 생성: `POST {CONTENT_API_URL}/generate/grok`
- Body: `{ service, keyword, ref }`

## Commands
```bash
npm run dev      # 개발 서버 (Turbopack)
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버
npm run lint     # ESLint 검사
```

## Future Roadmap
1. 다중 키워드 배치 처리
2. 다중 네이버 계정 관리
3. 페르소나별 글쓰기 스타일
4. 자동 댓글 기능
5. 스케줄링 (Cron)
