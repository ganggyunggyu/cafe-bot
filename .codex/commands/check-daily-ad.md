# 일상광고(daily-ad) 글 링크 조회

카페별 댓글 차단 상태인 글(daily-ad)을 찾아 링크를 정리합니다.

## 작업 흐름

### 1단계: 대상 카페 확인

사용자에게 대상 카페를 확인합니다. 기본은 샤넬오픈런.

| 카페명 | cafeId |
|--------|--------|
| 샤넬오픈런 | 25460974 |
| 쇼핑지름신 | 25729954 |
| 건강한노후준비 | 25636798 |
| 건강관리소 | 25227349 |

### 2단계: 스크립트 실행

```bash
npx tsx --env-file=.env.local scripts/check-daily-ad.ts [cafeId]
```

- cafeId 미지정 시 샤넬오픈런(25460974) 기본
- DB에서 writer 계정의 published 글을 조회
- 네이버 API의 `isWriteComment` 필드로 댓글 차단 여부 확인
- commenter 계정 중 첫 번째로 자동 로그인

### 3단계: 결과 정리

날짜별로 그룹핑하여 링크 목록을 출력합니다.

```
### 3/24 (5건)
- 25백 컬러 → https://cafe.naver.com/...
- 골든볼 베니티 → https://cafe.naver.com/...
```

## 판별 기준

- `isWriteComment: false` → 댓글 차단 = daily-ad 글
- `isWriteComment: true` → 댓글 허용 = 일반 글

daily-ad 글은 `/modify-posts`로 광고 전환 + 댓글 허용으로 변경할 수 있습니다.

## 파일 경로

- 스크립트: `scripts/check-daily-ad.ts`

## 사용법

```
/check-daily-ad
```
