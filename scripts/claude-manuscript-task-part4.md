# 샤넬 재수정 원고 생성 작업 4

외부 API 호출 금지냥  
현재 세션의 Claude Sonnet 4.6 자체 생성으로만 원고를 작성할 것냥  

## source of truth 프롬프트

- `src/features/viral/prompts/build-own-keyword-prompt.ts`
- `src/features/viral/prompts/build-competitor-advocacy-prompt.ts`

반드시 위 두 파일의 규칙과 출력 형식을 따를 것냥  
프롬프트를 임의로 축약하지 말 것냥  

## 출력 파일

- `scripts/generated-manuscripts-claude-part4.json`

형식:

```json
[
  {
    "articleId": 291018,
    "keyword": "비에날씬 유산균",
    "raw": "[제목]\n...\n\n[본문]\n...\n\n[댓글]\n[댓글1] ..."
  }
]
```

## 필수 규칙

- 다른 파일 수정 금지냥
- API / fetch 호출 금지냥
- 위 프롬프트 파일을 직접 읽고 그 스타일대로 생성할 것냥
- `raw`는 반드시 `[제목]`, `[본문]`, `[댓글]` 섹션을 모두 포함할 것냥
- 댓글 수를 줄이지 말 것냥
- `own` 키워드는 자사광고 프롬프트 기준 댓글/대댓글 볼륨 유지할 것냥
- `competitor` 키워드는 타사옹호 프롬프트 기준 댓글/대댓글 볼륨 유지할 것냥
- sparse 댓글 패턴 금지냥

## 작업 목록

1. `articleId=291018` / `비에날씬 유산균` / `competitor`
2. `articleId=289754` / `임신준비엽산` / `own`
3. `articleId=289677` / `콜라겐 비오틴` / `competitor`
4. `articleId=288077` / `이소플라본` / `own`

## 완료 보고

파일 저장 후 아래만 간단히 출력할 것냥

- 생성 건수
- 저장 경로
- 누락 여부
