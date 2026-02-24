# features/viral — Viral Marketing System

## OVERVIEW

AI 기반 네이버 카페 바이럴 콘텐츠 자동 생성 및 발행. 인기글 파싱 → AI 프롬프트 → 글/댓글/답글 생성 → 큐 발행.

## STRUCTURE

```
viral/
├── viral-actions.ts      # server action 래퍼 (thin)
├── viral-batch-job.ts    # ★ 486줄 — 바이럴 배치 처리 엔진
├── viral-batch-ui.tsx    # ★ 1,089줄 — 바이럴 배치 UI (가장 큰 파일)
├── viral-debug.ts        # 디버그 유틸 (AI 응답 저장/조회)
├── viral-debug-ui.tsx    # 디버그 UI
├── viral-parser.ts       # ★ 317줄 — AI 응답 파싱 (regex 기반)
├── viral-prompt.ts       # 프롬프트 빌더 진입점
└── prompts/              # AI 프롬프트 데이터
    ├── index.ts           # barrel
    ├── types.ts           # 프롬프트 타입 (ViralPromptInput, PersonaConfig)
    ├── build-casual-prompt.ts   # 일상/후기 스타일 프롬프트
    ├── build-info-prompt.ts     # 정보성 콘텐츠 프롬프트 (196줄)
    ├── build-anime-prompt.ts    # 애니메이션 스타일 프롬프트
    ├── personas.ts        # 일반 페르소나 정의
    ├── anime-personas.ts  # 애니메이션 캐릭터 페르소나
    └── products.ts        # 제품 데이터베이스
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| 바이럴 배치 실행 | `viral-batch-job.ts` | `runViralBatch()` — 메인 엔진 |
| AI 응답 파싱 | `viral-parser.ts` | `parseViralResponse()` — `[태그]` 형식 |
| 프롬프트 생성 | `viral-prompt.ts` | `buildViralPrompt()` → prompts/ 위임 |
| 디버그/히스토리 | `viral-debug.ts` | `saveViralResponse()` — MongoDB 저장 |
| API 라우트 | `app/api/viral/batch/route.ts` | HTTP 엔드포인트 (runViralBatch import) |

## KEY FLOW

```
viral-batch-ui.tsx (사용자 입력: 키워드, 스타일, 계정)
  → viral-actions.ts (server action)
    → viral-batch-job.ts
      1. 키워드별 loop:
         a. buildViralPrompt() → AI 프롬프트 생성
         b. content-api 호출 → AI 콘텐츠 생성
         c. parseViralResponse() → 제목/본문/댓글 구조화
         d. viral-debug.ts → ViralResponse MongoDB 저장
         e. addTaskJob() → post 큐잉
         f. viralComments → comment/reply 큐잉
```

## AI 파싱 형식 (viral-parser.ts)

```
[제목] 글 제목
[본문] 글 내용...
[댓글1] 첫 번째 댓글
[답글1-1] 글쓴이의 답글
[댓글2] 두 번째 댓글
```
- `[댓글N]` → type: 'comment'
- `[답글N-M]` → type: 'author_reply' | 'commenter_reply' | 'other_reply'
- 레거시 형식도 fallback 지원

## ANTI-PATTERNS

### ⚠️ GOTCHAS
1. **viral-batch-ui.tsx 1,089줄**: 분할 필요 — 키워드 입력, 옵션, 계정 선택, 진행상황 섹션
2. **index.ts 없음**: 다른 features와 달리 barrel export 미존재 → 직접 파일 import
3. **auto-comment/batch 의존**: `PostOptions`, `PostOptionsUI` import — cross-feature coupling
4. **viral-parser.ts regex 취약**: AI 응답 형식 변경 시 파싱 실패 → `parseError` 필드로 추적
5. **viral-debug.ts 타입 불일치**: `saveViralResponse()` 호출 시 Mongoose lean 타입과 충돌 (기존 LSP 에러)
