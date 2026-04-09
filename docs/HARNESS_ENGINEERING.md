# Harness Engineering

## 목적

이 프로젝트에서 하네스 엔지니어링은 "에이전트와 개발자가 핵심 흐름을 외부 시스템 없이 재현, 검증, 회귀 방지할 수 있도록 레포 안에 실행 환경을 설계하는 것"으로 정의한다.

적용 이유는 다음과 같다.

- 네이버 자동화, Redis 큐, 브라우저 세션은 실제 환경 비용이 큼
- ad-hoc 스크립트만으로는 회귀를 빠르게 확인하기 어려움
- 핵심 규칙을 코드와 테스트로 고정해야 이후 변경 속도를 유지 가능

## 현재 적용 원칙

### 1. 루트 지식은 하나로

- 루트 source of truth는 `AGENTS.md`
- 세부 설명은 `docs/` 와 하위 `AGENTS.md` 로 내려감

### 2. 외부 의존성 앞에 seam 만들기

- 큐 추가 로직은 `task-job-harness.ts` 로 분리
- 시퀀스 제어 로직은 `sequence-harness.ts` 로 분리
- Redis, Queue, 시간, sleep 은 주입 가능해야 함

### 3. 위험 영역은 deterministic test로 고정하기

- 중복 Job 스킵
- 지연 시간 선택
- 시퀀스 대기 / 스킵 / 스톨 강제 진행

### 4. 모든 작업은 검증 루프까지 포함하기

- 테스트 코드 작성/수정 → 구현 → strict lint → 관련 테스트 실행 → 원하는 결과 확인 순서로 진행
- 결과 확인은 테스트 출력, UI 변화, 로그, 하네스 결과 중 해당 작업에 맞는 source of truth로 검증
- 작업 종료 시에는 의미 단위 커밋이 가능한 상태로 변경 범위를 정리
- 새 하네스가 없으면 최소한 기존 테스트 또는 새 계약 테스트를 추가해 회귀 지점을 남김
- 가능하면 `npm run verify:task` 를 공통 진입점으로 사용
- lint gate는 changed file strict mode를 기본으로 적용해, 수정한 파일은 warning 없이 유지
- Next build는 앱 코드(`src/` 중심) 검증에 집중하고, 운영 스크립트는 별도 lint/test 게이트로 분리

## 현재 하네스 파일

- `src/shared/lib/queue/task-job-harness.ts`
- `src/shared/lib/queue/sequence-harness.ts`
- `src/shared/lib/queue/testing/queue-test-harness.ts`
- `src/shared/lib/queue/task-job-harness.test.ts`
- `src/shared/lib/queue/sequence-harness.test.ts`
- `scripts/harness-verify.ts`
- `scripts/harness-verify.test.ts`

## 실행

```bash
npm run test:harness
```

추가로 모든 작업에서 아래 검증을 기본으로 삼는다.

```bash
npm run verify:task -- \
  --lint-target "src/path/to/file.ts" \
  --lint-target "scripts/path/to/file.ts" \
  --test "npx tsx --test <관련 테스트 파일>" \
  --verify "<원하는 결과를 확인하는 명령>"
```

필요하면 `--commit "<message>"` 로 검증 통과 직후 커밋까지 이어서 수행한다.

## verify:task 규칙

- `--test` 는 최소 1개 필수다
- `--lint-target` 은 최소 1개 필수이며, 현재 작업에서 수정한 코드 파일이나 디렉터리만 넣는다
- 기본적으로 `npm run lint:strict -- <lint-targets...>` 와 `npm run test:harness` 를 먼저 실행한다
- `--verify` 는 선택이지만, 가능한 한 실제 결과 확인 명령을 함께 넣는다
- `--no-lint`, `--no-harness` 로 생략할 수 있지만 생략 이유를 작업 로그에 남긴다
- `--commit` 을 주면 `git status --short` 확인 뒤 `git commit -m` 까지 수행한다

## 다음 확장 후보

- `multi-session.ts` idle cleanup / lock race 하네스
- `post-handler.ts` 댓글 체이닝 계약 테스트
- 네이버 UI selector 회귀용 browser harness
