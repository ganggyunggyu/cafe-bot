# 카페 캠페인 스케줄 큐 추가

키워드 파일 기반으로 광고/일상 글을 시간대별로 스케줄링하여 큐에 추가합니다.

## 작업 흐름

### 1단계: 입력 확인

사용자에게 아래 정보를 확인합니다:

- **대상 카페**: 쇼핑지름신 / 샤넬오픈런 / 둘 다
- **카페별 글 수**: 광고 N개 + 일상 N개 (예: 쇼핑 광고10 일상5, 샤넬 광고5 일상5)
- **마감 시간**: 기본 오후 10시 (22:00)

### 2단계: 키워드 선정

1. **광고 키워드 파일 로드**: `scripts/keywords/ad-keywords.txt`
2. **사용된 키워드 제외**: `scripts/keywords/used-keywords.txt`에 있는 키워드 제외
3. **중복 제거 + 셔플**: 남은 키워드에서 랜덤 셔플로 필요한 수만큼 선택
4. **일상 키워드 생성**: 시간대에 맞는 자연스러운 일상 키워드 직접 생성

### 3단계: 시간 배정

일상 키워드는 내용에 맞는 시간대에 배치:

| 키워드 유형 | 적합 시간대 |
|------------|-----------|
| 점심/메뉴 관련 | 11:00~13:00 |
| 오후 간식/졸림 | 13:00~15:00 |
| 카페/산책/날씨 | 시간 무관 (낮) |
| 퇴근/저녁반찬 | 17:00~19:00 |
| 드라마/야식 | 19:00~21:00 |

광고 키워드는 시간 무관, 현재~마감까지 균등 분배.

**계정 간격 규칙**: 같은 계정은 최소 1시간 이상 간격 유지.

### 4단계: 사용자 확인

아래 형식의 표로 전체 스케줄을 보여주고 확인받습니다:

```
## 카페명

| 키워드 | 카테고리 | 타입 | 계정 | 시간 |
|--------|---------|------|------|------|
```

수정 요청이 있으면 반영 후 재확인.

### 5단계: 큐 추가 실행

확인 받으면 `scripts/run-schedule.ts`의 SCHEDULE 배열을 업데이트하고 실행합니다:

```bash
npx tsx --env-file=.env.local scripts/run-schedule.ts
```

### 6단계: 사용된 키워드 기록

실행 완료 후, 이번에 사용한 **광고 키워드만** `scripts/keywords/used-keywords.txt` 파일 맨 아래에 추가합니다.

```bash
# 예시: 사용한 광고 키워드 목록을 한 줄씩 append
cat >> scripts/keywords/used-keywords.txt << 'EOF'
출산선물추천
임산부선물추천
60대여자선물
EOF
```

- 일상 키워드는 기록하지 않음
- 추가 후 사용자에게 추가된 키워드 목록을 알려줌

## 카페 정보

| 카페명 | cafeId | 광고 카테고리 | 일상 카테고리 |
|--------|--------|-------------|-------------|
| 쇼핑지름신 | 25729954 | 일반 쇼핑후기 | 일상톡톡 |
| 샤넬오픈런 | 25460974 | _ 일상샤반사 📆 | _ 일상샤반사 📆 |

## Writer 계정

- compare14310
- fail5644
- loand3324
- dyulp
- gmezz

## 댓글 동작

`run-schedule.ts`는 글 생성 시 `parseViralResponse`로 rawContent의 `[댓글]` 섹션을 파싱하여 `viralComments`를 PostJobData에 포함시킴.
글 발행 후 commenter 3~5개 계정이 3분 간격으로 자연스럽게 댓글을 달게 됨 (viral-batch와 동일 로직).

## 파일 경로

### 핵심 스크립트
- 스케줄 스크립트: `scripts/run-schedule.ts`
- 캠페인 참고: `scripts/run-campaign.ts`

### 키워드 파일
- 광고 키워드 풀: `scripts/keywords/ad-keywords.txt`
- 사용된 키워드: `scripts/keywords/used-keywords.txt`

### 큐 관리 유틸
- 전체 큐 클리어: `scripts/queue-clear-all.ts`
- 사이드잡(comment/like)만 제거: `scripts/queue-remove-side-jobs.ts`
- 큐 상태 확인 (delayed/waiting/completed): `scripts/check-queue-status.ts`
- 오늘 발행 글 댓글 중복 체크: `scripts/check-comments.ts`

## 사용법

```
/schedule-campaign
```
