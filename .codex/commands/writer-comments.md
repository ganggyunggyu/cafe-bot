# Writer 계정 사이드 댓글 작성

Writer 계정으로 카페 글에 댓글을 작성하는 스킬입니다.

## 작업 흐름

### 1단계: 입력 확인

사용자에게 아래 정보를 확인합니다:

- **대상 카페**: 쇼핑지름신, 샤넬오픈런 등
- **카페별 댓글 수**: 기본 계정당 3개씩
- **총 댓글 목표**: 기본 30개
- **계정 간격**: 기본 1분

### 2단계: 스크립트 설정

`scripts/run-writer-comments.ts`의 설정을 업데이트합니다:

```typescript
const TARGETS: CafeTarget[] = [
  { name: "쇼핑지름신", cafeId: "25729954", commentsPerAccount: 3 },
  { name: "샤넬오픈런", cafeId: "25460974", commentsPerAccount: 3 },
];
```

### 3단계: 실행

```bash
npx tsx --env-file=.env.local scripts/run-writer-comments.ts
```

스크립트가 자동으로:
1. 각 카페의 최근 글 50개를 조회
2. 자기 글(writer 닉네임) 제외
3. 랜덤으로 댓글 대상 선정
4. AI로 글 내용 읽고 자연스러운 댓글 생성
5. 계정별 병렬로 큐 추가 (같은 계정은 1분 간격)

### 4단계: 결과 확인

큐 처리 완료 후 각 계정별 댓글 수 확인.

## Writer 계정

| accountId | 닉네임 |
|-----------|--------|
| mixxut | 에스앤비안과 1 |
| ynattg | 에스앤비안과 2 |
| ags2oigb | 찐찐찐찐찐이야 |
| wound12567 | 투디치과 스킨블 |
| precede1451 | 토토리토 |

## 카페 정보

| 카페명 | cafeId | 비고 |
|--------|--------|------|
| 쇼핑지름신 | 25729954 | 일상톡톡 게시판 위주 |
| 샤넬오픈런 | 25460974 | 일상 카테고리 위주 |

## 파일 경로

- 댓글 스크립트: `scripts/run-writer-comments.ts`

## 사용법

```
/writer-comments
```
