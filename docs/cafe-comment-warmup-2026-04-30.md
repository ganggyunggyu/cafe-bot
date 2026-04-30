# Cafe Comment Warmup 2026-04-30

## Target

- `mh8j62wm` / 샤넬오픈런: 댓글 목표 5개
- `mh8j62wm` / 쇼핑지름신: 댓글 목표 5개
- `nes1p2kx` / 샤넬오픈런: 댓글 목표 5개
- `nes1p2kx` / 쇼핑지름신: 댓글 목표 5개
- `tinyfish183` / 샤넬오픈런: 댓글 목표 5개

## Execution Notes

- `scripts/schedule-writer-levelup-comments.ts`로 목표 조합별 댓글 큐를 예약함.
- 첫 실행 중 딜레이 계산이 과밀하게 잡혀 `mh8j62wm` 10개가 먼저 들어갔고, 이후 하네스를 수정해 대기/진행 큐와 오늘 활동 기록을 합산하게 함.
- 댓글 검증 단계에서 실제 카페 닉네임과 DB 닉네임이 달라 false negative가 발생함.
- `src/features/auto-comment/comment-writer.ts`를 수정해 내용이 정확히 매칭되면 닉네임 불일치여도 등록 성공으로 인정하게 함.
- 기존 bull-board 워커를 내리고 PM2 `cafe-bull-board` 워커를 새 코드로 기동함.
- 보강 실행에서 이미 시도한 글번호는 제외하고 부족분 8개를 추가 예약함.

## Current Queue Status Snapshot

- `mh8j62wm` / 샤넬오픈런: 성공 1개, 대기 4개, 초기 soft fail 10개
- `mh8j62wm` / 쇼핑지름신: 성공 4개, 대기 1개, 초기 soft fail 2개
- `nes1p2kx` / 샤넬오픈런: 성공 2개, 대기 3개, 초기 soft fail 2개
- `nes1p2kx` / 쇼핑지름신: 성공 0개, 대기 5개
- `tinyfish183` / 샤넬오픈런: 성공 1개, 대기 4개, 초기 soft fail 2개

## Failure Record

- Early 샤넬 jobs often returned `댓글이 등록되지 않음 (닉네임+내용 매칭 실패)` because cafe nickname differed from the DB nickname.
- Some retry jobs returned `댓글 작성 락 중복 - BullMQ retry 대기`; these were treated as stale duplicate retry records.
- One shopping retry returned `browserContext.newPage: Target page, context or browser has been closed` around the worker restart; replacement/pending jobs cover the target count.
- No hard BullMQ failed jobs were present in the last snapshot.
