# 카페 글/댓글 검증

전일/금일 기준으로 카페별 발행 수가 목표치에 도달했는지, 댓글에 이상 징후가 없는지 빠르게 검증하는 스킬입니다.

## 기본 원칙

- 1차 source of truth는 DB 리포트(`publishedarticles`)로 본다.
- 최종 확인은 네이버 UI를 기준으로 한다.
- 목표치는 사용자가 준 값을 우선한다.
- 기본 운영 목표치를 바로 쓰고 싶으면 `--default-targets` 를 쓴다.
- 단일 카페만 검증하고 목표치를 주지 않으면 최근 writer들의 `dailyPostLimit` 합으로 추정 목표치를 잡는다.

## 작업 흐름

### 1단계: 입력 확인

아래를 먼저 확인한다.

- 대상 카페: cafeId, 카페명, cafeUrl 중 하나
- 전일/금일 목표치
- 댓글 부족 경고 기준: 기본 3개
- 최종 UI 확인이 필요한지 여부

카페별 목표치가 다르면 반드시 명시 목표치를 받는다.

### 2단계: DB 리포트 실행

단일 카페 기본 예시:

```bash
npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts \
  --cafe 25729954 \
  --today-target 15 \
  --yesterday-target 15
```

여러 카페를 한 번에 볼 때:

```bash
npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts \
  --cafe 쇼핑지름신 \
  --cafe 샤넬오픈런 \
  --cafe-target 쇼핑지름신:15:15 \
  --cafe-target 샤넬오픈런:10:10
```

옵션 메모:

- `--date 2026-04-14`: 기준일(KST) 변경
- `--default-targets`: 운영 기본 목표치 자동 적용
- `--comment-warn-threshold 4`: 댓글/답글 합계 경고 기준 변경
- `--sample-limit 12`: 상세 문제 글 더 많이 출력
- `--summary-only`: 목표치 PASS/FAIL만 간단 출력
- `--json`: 후처리용 JSON 출력

### 3단계: 리포트 해석

스크립트는 날짜별로 아래를 보여준다.

- 목표 대비 실제 발행 건수 PASS/FAIL
- writer별 발행 분포
- 문제 글 수 / 총 이슈 수
- 글별 댓글/답글 실측치 vs 저장치
- 댓글 이상 징후

주요 이상 징후는 아래다.

- 댓글/답글 수 불일치
- non-daily-ad 글의 댓글 부족
- 글 내부 중복 댓글
- 다른 글에 같은 댓글 반복
- 원고 태그 누락(`[댓글1]`, `[작성자-1]` 등)
- 광고성 문구, 과장 표현, 의료 효능 단정
- 링크/문의 유도
- 이모지, 반말 의심, 공감 댓글 과다

### 4단계: UI 최종 확인

리포트에서 이상이 잡힌 글만 네이버 UI로 다시 확인한다.

- 네이버 작업은 OpenClaw 브라우저 우선
- 글 URL은 리포트에 포함되므로 그 글만 열어서 댓글 영역 확인
- 실제 UI에서 댓글 노출/삭제 가능 여부를 최종 판정으로 본다.

### 5단계: 후속 조치

유형별로 바로 이어서 처리한다.

- 중복 댓글 정리: `/delete-dup-comments`
- 잘못 올라간 댓글 수동 정리: `scripts/delete-wrong-comments.ts`
- 댓글 차단/허용 상태 점검: `/check-daily-ad`, `scripts/enable-comments.ts`

목표치만 빠르게 보고 싶으면 `/verify-cafe-goals` 를 먼저 사용한다.

## 파일 경로

- 검증 스크립트: `scripts/verify-cafe-posts.ts`
- 계약 테스트: `scripts/verify-cafe-posts.test.ts`

## 사용법

```text
/verify-cafe-posts
```
