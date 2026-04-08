# 카페 활동 (댓글 + 방문)

OpenClaw 브라우저로 Writer 계정들의 카페 활동(댓글, 방문)을 진행하는 스킬

## 입력 확인

사용자에게 아래 정보를 확인:
- **대상 카페**: 쇼핑지름신, 샤넬오픈런 등
- **계정**: DB에서 writer 역할 계정 조회
- **카페별 댓글 수**: 기본 쇼핑지름신 5개, 샤넬 20개
- **방문 횟수**: 기본 5회

## Writer 계정 조회

MongoDB에서 활성 writer 계정 조회:

```bash
node -e "
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb+srv://...';
(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const writers = await client.db('cafe-bot').collection('accounts')
    .find({ role: 'writer', isActive: true })
    .project({ accountId: 1, password: 1, nickname: 1, _id: 0 }).toArray();
  writers.forEach(w => console.log(JSON.stringify(w)));
  await client.close();
})();
"
```

## 카페 정보

| 카페명 | cafeId | cafeUrl |
|--------|--------|---------|
| 쇼핑지름신 | 25729954 | shopjirmsin |
| 샤넬오픈런 | 25460974 | shoppingtpw |

## 작업 흐름 (OpenClaw 브라우저)

### 1. 로그인

```bash
openclaw browser open "https://nid.naver.com/nidlogin.login"
# snapshot -> ID input ref 확인
openclaw browser snapshot --efficient
openclaw browser type <id-ref> "<accountId>"
openclaw browser type <pw-ref> "<password>"
# snapshot 다시 -> 로그인 버튼 ref 확인 (ref가 바뀜!)
openclaw browser snapshot --efficient
openclaw browser click <login-btn-ref>
# 3초 대기 후 네이버 메인 도착 확인
```

**주의**: 아이디/비밀번호 입력 후 ref가 바뀌므로, 로그인 버튼 클릭 전에 반드시 snapshot을 다시 찍어서 새 ref를 확인해야 함

### 2. 카페 가입 (미가입 시)

```bash
openclaw browser navigate "https://m.cafe.naver.com/<cafeUrl>"
# "카페 가입하기" 버튼이 보이면:
openclaw browser click <join-ref>
# 닉네임 + 가입 질문 답변 입력
openclaw browser type <nickname-ref> "<nickname>"
openclaw browser type <q1-ref> "네 숙지했습니다"
openclaw browser type <q2-ref> "네 알겠습니다"
# ...
openclaw browser click <submit-ref>  # "동의 후 가입하기"
```

### 3. 모바일 게시판 이동 (일상 게시판)

```bash
# 모바일 메뉴 URL 형식 (iframe 이슈 없음)
openclaw browser navigate "https://m.cafe.naver.com/ca-fe/web/cafes/<cafeId>/menus/<menuId>"
```

- 쇼핑지름신 일상톡톡 menuId: `948`
- 샤넬오픈런: 홈 피드에서 `[일상]` 태그 글 선택

### 4. 댓글 작성 사이클

**한 글당 댓글 작성 순서:**

```bash
# 1) 글 클릭
openclaw browser click <post-ref>
# 2초 대기

# 2) 글 내용 읽기
openclaw browser evaluate --fn '() => { const a = document.querySelector(".se-main-container") || document.querySelector("article"); return a ? a.innerText.substring(0,300) : ""; }'

# 3) 댓글 영역 열기
openclaw browser snapshot --efficient
# "첫 댓글을 남겨보세요" 또는 "댓글 N" 링크 클릭
openclaw browser click <comment-area-ref>
# 1초 대기

# 4) 댓글 텍스트 입력 (contenteditable div - 반드시 execCommand 사용)
# 파일로 JS 작성 후 evaluate
cat <<'SCRIPT' > /tmp/cafe-comment.js
() => {
  const el = document.querySelector("div.text_input_area[contenteditable]");
  if (!el) return "not found";
  el.focus();
  document.execCommand("selectAll");
  document.execCommand("delete");
  document.execCommand("insertText", false, "댓글 내용 여기에");
  return el.textContent.substring(0, 100);
}
SCRIPT
openclaw browser evaluate --fn "$(cat /tmp/cafe-comment.js)"

# 5) 등록 버튼 클릭
openclaw browser snapshot --efficient
# "등록" 버튼 ref 확인 (disabled 아닌지 체크)
openclaw browser click <submit-ref>
# 2초 대기

# 6) 댓글 등록 확인
openclaw browser snapshot --efficient
# 자기 닉네임이 보이면 성공
```

### 5. 로그아웃

```bash
openclaw browser navigate "https://nid.naver.com/nidlogin.logout"
```

### 6. 다음 계정으로 반복

로그아웃 후 1단계부터 다시 진행

## 핵심 주의사항

1. **ref는 매번 바뀜**: 모든 click/type 전에 snapshot을 다시 찍어서 최신 ref 사용
2. **모바일 카페 사용**: `m.cafe.naver.com` 사용 (iframe 이슈 없음)
3. **contenteditable 입력**: `document.execCommand("insertText")` 사용 필수 (textContent 직접 설정하면 React 상태 안 바뀜)
4. **JS evaluate 시 특수문자 주의**: 파일로 JS 작성 후 `$(cat /tmp/file.js)` 형태로 전달
5. **댓글 내용**: 글 내용을 읽고 자연스럽고 공감하는 댓글 작성 (광고성 X)
6. **OpenClaw 우선**: cmux browser가 아닌 openclaw browser 사용

## 사용법

```
/cafe-activity
```
