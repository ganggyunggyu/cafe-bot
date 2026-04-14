# 카페 글 목표치 점검

전일/금일 기준으로 카페별 게시글이 목표치까지 전부 작성됐는지 실제 카페 접속 기준으로 빠르게 확인하는 스킬입니다.

다음 요청에 우선 사용합니다.

- 어제 카페글 누락 있는지 확인
- 오늘 카페별 목표치 달성 여부 확인
- 전일/금일 카페 발행 건수 PASS/FAIL만 빠르게 보고 싶음

## 기본 원칙

- source of truth는 실제 네이버 카페 글 목록입니다.
- DB(`publishedarticles`)는 보조 참고용이고 최종 판정에 쓰지 않습니다.
- 기본 검증 범위는 운영 4개 카페입니다.
- 기본 목표치는 운영 기준값을 사용합니다.
  - 쇼핑지름신: 15건
  - 샤넬오픈런: 10건
  - 건강한노후준비: 12건
  - 건강관리소: 12건
- 사용자가 카페나 목표치를 따로 주면 그 값을 우선합니다.

## 작업 흐름

### 1단계: 기준일 확인

- 기본은 금일 KST
- 전일 누락 확인이면 `--date` 에 확인 기준일을 넣고, 리포트의 `전일` 줄을 본다
- 예: 2026-04-14에 어제 누락을 볼 때는 `--date 2026-04-14` 로 실행 후 `전일 2026-04-13` 확인

### 2단계: 실카페 리포트 실행

운영 4개 카페 기본 예시:

```bash
npx tsx --env-file=.env.local scripts/verify-cafe-goals-live.ts \
  --date 2026-04-14 \
  --show-posts
```

특정 기준일 포함 예시:

```bash
npx tsx --env-file=.env.local scripts/verify-cafe-goals-live.ts \
  --date 2026-04-14 \
  --cafe 쇼핑지름신 \
  --show-posts
```

### 3단계: 판정

리포트는 카페별로 아래를 보여줍니다.

- 전일 PASS/FAIL
- 금일 PASS/FAIL
- 목표 건수 / 실제 건수
- 부족/초과 차이
- 실제로 잡힌 글 목록(시간, 닉네임, articleId, 제목)

판정 기준은 단순합니다.

- `PASS`: 실제 발행 건수 >= 목표치
- `FAIL`: 실제 발행 건수 < 목표치
- `목표 미지정`: 기본 목표치가 없는 카페이거나 사용자가 목표치를 주지 않음

### 4단계: FAIL 카페 상세 확인

```bash
npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts \
  --date 2026-04-14 \
  --cafe 쇼핑지름신 \
  --default-targets
```

여기서는 DB 기준 상세 리포트로 writer 분포, 문제 글, 댓글 이상 징후까지 함께 봅니다.

### 5단계: 최종 UI 확인

실카페 리포트에서 누락이 의심되면 네이버 UI에서 게시글 링크를 직접 다시 열어 확인합니다.

- 네이버 작업은 OpenClaw 브라우저 우선
- 실제 카페 글 목록과 게시글 URL 노출 여부를 확인
- DB 누락인지 실제 발행 실패인지 분리해서 보고

## 파일 경로

- 실카페 검증 스크립트: `scripts/verify-cafe-goals-live.ts`
- 실카페 계약 테스트: `scripts/verify-cafe-goals-live.test.ts`
- DB 상세 검증 스크립트: `scripts/verify-cafe-posts.ts`
- 계약 테스트: `scripts/verify-cafe-posts.test.ts`
- 상세 검증 스킬: `.claude/commands/verify-cafe-posts.md`

## 사용법

```text
/verify-cafe-goals
```
