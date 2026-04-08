# 중복 댓글 삭제

Writer 계정의 중복 댓글을 찾아서 삭제하는 스킬입니다.

## 배경

`run-writer-comments.ts` 스크립트의 큐 중복 처리로 인해 동일 댓글이 30~40회 반복 게시되는 문제가 발생할 수 있습니다. 이 스킬은 해당 중복 댓글을 자동으로 탐색하고 삭제합니다.

## 계정 ↔ 카페 닉네임 매핑 (샤넬오픈런)

| accountId | 카페 닉네임 | 비밀번호 |
|-----------|-----------|---------|
| ags2oigb | 에이지 | dlrbghdqudtls |
| wound12567 | 디디아 | akfalwk12 |
| ynattg | yna | sadito0229! |
| mixxut | 에앤과1 | sadito0229! |
| precede1451 | 토토리토 | akfalwk12!! |

## 카페 정보

| 카페명 | cafeId | 옛날 URL |
|--------|--------|---------|
| 샤넬오픈런 | 25460974 | shoppingtpw |
| 쇼핑지름신 | 25729954 | (미확인) |

## 작업 흐름

### 1단계: 대상 확인

사용자에게 아래 정보를 확인합니다:
- **대상 카페**: 샤넬오픈런 / 쇼핑지름신
- **대상 계정**: 전체 또는 특정 계정
- 기본: 5개 계정 전부, 샤넬오픈런

### 2단계: 실행

`scripts/delete-dup-comments.ts`의 `WRITER_ACCOUNTS` 배열과 `CAFE_ID`를 설정한 후 실행합니다.

```bash
npx tsx --env-file=.env.local scripts/delete-dup-comments.ts
```

### 3단계: 동작 원리

1. 각 계정 로그인 (multi-session)
2. 카페 글 목록 API로 15페이지(750개) 조회
3. 댓글 3개 이상인 글에 순차 접근
4. 각 글에서 `CommentItem--mine` (내 댓글) 확인
5. 같은 내용 2개 이상이면 첫 번째만 남기고 삭제
6. 삭제 방법: "더보기" 버튼(`button.comment_tool_button[aria-label="더보기"]`) → 드롭다운에서 "삭제" → "확인"

### 핵심 셀렉터

- 내 댓글: `.CommentItem--mine`
- 댓글 ID: `li[id="{commentId}"]`, `data-cid="{cafeId}-{articleId}-{commentId}"`
- 더보기 버튼: `#commentItem{commentId}` 또는 `button.comment_tool_button`
- 삭제 버튼: 드롭다운 내 `button:has-text("삭제")`
- 확인 버튼: `button:has-text("확인")`

### 4단계: 결과 보고

계정별 삭제 건수를 보고합니다.

## 참고

- 나의 활동 페이지 접근 방법: 옛날 카페 URL(`cafe.naver.com/{cafeUrl}`) → 사이드바 "나의활동" 클릭 → "내가 쓴 댓글" 링크 확인
- 새 카페 디자인(`/ca-fe/cafes/{id}`)은 SPA 렌더링 안 됨 — API 호출만 가능
- 글 상세 페이지(`/ca-fe/cafes/{id}/articles/{articleId}`)는 정상 렌더링

## 파일 경로

- 삭제 스크립트: `scripts/delete-dup-comments.ts`

## 사용법

```
/delete-dup-comments
```
