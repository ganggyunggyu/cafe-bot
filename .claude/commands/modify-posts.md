# 카페 글 수정 (일상광고 → 광고/애니 전환)

카페 링크 + 키워드 매칭을 받아 기존 글을 수정하고 댓글을 다는 스킬입니다.

## 작업 흐름

### 1단계: 입력 확인

사용자에게 아래 형식으로 링크 + 키워드 쌍을 받습니다:

```
링크1 | 키워드1
링크2 | 키워드2
```

또는 표 형식:

```
| 링크 | 키워드 |
|------|--------|
| https://cafe.naver.com/... | 키워드1 |
```

### 2단계: 링크 파싱 + 작성자 확인

1. 각 링크에서 `cafeId` + `articleId` 파싱
2. `PublishedArticle` DB에서 `writerAccountId` 조회
3. 작성자 계정 정보 확인

**지원 링크 형식:**
- `iframe_url_utf8` 파라미터 포함: `clubid=숫자&articleid=숫자`
- 직접 경로: `/cafes/{cafeId}/articles/{articleId}`

### 3단계: 원고 생성 스타일 결정

LOGIN_ID에 따라 수정 원고 스타일이 자동 결정됩니다:

| LOGIN_ID | 대상 카페 | 수정 스타일 | 프롬프트 |
|----------|----------|-----------|---------|
| `qwzx16` | 벤타쿠/으스스/다향만리 | 애니 스타일 | `buildViralPrompt` (애니) |
| `21lab` | 샤넬/쇼핑/건강 | 광고 스타일 | `buildOwnKeywordPrompt` |

### 4단계: 사용자 확인

수정 대상 목록을 표로 보여주고 확인받습니다:

```
| # | articleId | 작성자 | 기존 제목 | 새 키워드 |
|---|-----------|--------|----------|----------|
```

### 5단계: 수정 실행

확인 받으면 `scripts/run-modify.ts`의 `MODIFY_SCHEDULE` 배열을 업데이트하고 실행합니다.

**실행 전 반드시 LOGIN_ID 확인:**
- 벤타쿠 등 테스트 카페: `qwzx16`
- 샤넬/쇼핑/건강 카페: `21lab`

```bash
npx tsx --env-file=.env.local scripts/run-modify.ts
```

수정 시 자동으로:
- 제목 + 본문 변경
- 댓글 허용으로 전환 (`enableComments: true`)
- 바이럴 댓글 + 대댓글 큐 추가

### 6단계: 광고 키워드 시트 기록

샤넬오픈런/쇼핑지름신 카페의 수정된 글이 있으면, 해당 광고 키워드를 구글 시트에 append합니다.

**시트 정보:**
- Spreadsheet ID: `1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms`
- 시트 탭: `카페키워드` (gid: 1923976827)
- 칼럼: 카페 / 키워드 / 발행일 / 발행횟수

**기록 방법:**
- Google Sheets API v4 (googleapis + google-auth-library)
- `.env`의 `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`로 인증
- 기존 데이터 아래에 append (clear하지 않음)
- 건강카페 키워드는 제외, 샤넬/쇼핑만 기록

### 7단계: 결과 보고

수정 결과를 보고합니다:
- 성공/실패 건수
- 각 글의 새 제목
- 큐에 추가된 댓글/대댓글 수

## 파일 경로

- 수정 스크립트: `scripts/run-modify.ts`
- 수정 로직: `src/features/auto-comment/batch/article-modifier.ts`

## 사용법

```
/modify-posts
```
