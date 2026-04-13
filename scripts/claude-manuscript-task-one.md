# 샤넬 재수정 원고 생성 테스트 1건

외부 API 호출 금지냥  
현재 세션의 Claude Sonnet 4.6 자체 생성으로만 작성할 것냥  

## source of truth

- `src/features/viral/prompts/build-own-keyword-prompt.ts`

## 목표

아래 1건만 생성해서 파일로 저장할 것냥

- `articleId=292072`
- `keyword=중학생영양제`
- `keywordType=own`

## 출력 파일

- `scripts/generated-manuscripts-claude-test.json`

형식:

```json
[
  {
    "articleId": 292072,
    "keyword": "중학생영양제",
    "raw": "[제목]\n...\n\n[본문]\n...\n\n[댓글]\n..."
  }
]
```

## 필수

- `[제목]`, `[본문]`, `[댓글]` 섹션 모두 포함할 것냥
- 댓글 수를 줄이지 말 것냥
- 다른 파일 수정 금지냥
- 파일 저장 후 생성 완료만 짧게 보고할 것냥
