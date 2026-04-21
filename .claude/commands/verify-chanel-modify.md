# 샤넬 일상키워드 수정 검증

샤넬오픈런 카페의 daily-ad 글이 실제로 수정되었는지 링크에 직접 접속하여 검증합니다.

## 판별 기준

| 상태 | 조건 | 의미 |
|------|------|------|
| UNMODIFIED | 제목 동일 + 댓글 차단 | 미수정 확실 |
| MODIFIED_DB_MISS | 제목 변경 + 댓글 허용 | 수정됐으나 DB 미반영 |
| COMMENTS_OPEN | 제목 동일 + 댓글 허용 | 댓글만 열림 (부분 수정) |
| TITLE_CHANGED | 제목 변경 + 댓글 차단 | 제목만 변경됨 |
| DELETED | API 404 | 카페에서 삭제됨 |

## 작업 흐름

### 1단계: DB에서 미수정 대상 조회

```bash
npx tsx --env-file=.env.local -e '
import mongoose from "mongoose";
import { PublishedArticle } from "./src/shared/models/published-article";

await mongoose.connect(process.env.MONGODB_URI!);
const count = await PublishedArticle.countDocuments({
  cafeId: "25460974",
  postType: "daily-ad",
  status: { $ne: "modified" },
});
const modified = await PublishedArticle.countDocuments({
  cafeId: "25460974",
  postType: "daily-ad",
  status: "modified",
});
console.log("미수정:", count, "/ 수정완료:", modified);
await mongoose.disconnect();
'
```

### 2단계: 실제 링크 방문 검증

아래 스크립트를 실행합니다:

```bash
npx tsx --env-file=.env.local scripts/verify-chanel-daily-ad.ts
```

이 스크립트는:
1. DB에서 `cafeId=25460974, postType=daily-ad, status≠modified` 조회
2. checker 계정(8i2vlbym)으로 로그인
3. 각 글의 네이버 API를 호출하여 현재 상태 확인
4. 제목 일치 여부 + 댓글 허용 여부로 수정 상태 판별
5. 날짜별 그룹핑하여 결과 출력

### 3단계: 결과 보고

날짜별로 그룹핑하여 미수정 확실(UNMODIFIED) 건만 테이블로 정리합니다.

```
### 4/20 (5건)
| articleId | 계정 | 제목 |
|-----------|------|------|
| 294549 | uqgidh2690 | 이번 주 두근두근이에요ㅎㅎ |
```

마지막에 요약:
- 미수정 확실: N건
- 삭제됨: N건
- 수정됐으나 DB 미반영: N건

### 4단계: 후속 조치 안내

미수정 글이 있으면 `/modify-posts`로 수정 가능함을 안내합니다.

## 스크립트 경로

- `scripts/verify-chanel-daily-ad.ts`

## 사용법

```
/verify-chanel-modify
```
