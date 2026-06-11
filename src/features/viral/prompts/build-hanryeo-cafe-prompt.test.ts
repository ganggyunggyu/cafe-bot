import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHanryeoCafePrompt } from './build-hanryeo-cafe-prompt';

test('buildHanryeoCafePrompt keeps the cafe parser output contract', () => {
  const prompt = buildHanryeoCafePrompt({
    keyword: '수족냉증',
    category: '건강정보',
  });

  assert.match(prompt, /\[제목\]/);
  assert.match(prompt, /\[본문\]/);
  assert.match(prompt, /\[댓글\]/);
  assert.match(prompt, /\[댓글1\]/);
  assert.match(prompt, /\[작성자-N\]/);
  assert.match(prompt, /\[댓글러-N\]/);
  assert.match(prompt, /\[제3자-N\]/);
  assert.match(prompt, /수족냉증/);
  assert.match(prompt, /카테고리\/게시판 힌트: 건강정보/);
  assert.match(prompt, /본문 전체에서 "한려담원"은 1회만 쓴다/);
  assert.match(prompt, /댓글 전체에서 "한려담원"은 1~2회만/);
  assert.match(prompt, /바로 \[제목\]부터 출력한다/);
});

test('buildHanryeoCafePrompt requires product connection without title branding', () => {
  const prompt = buildHanryeoCafePrompt({ keyword: '흑염소진액' });

  assert.match(prompt, /제품명: 한려담원 흑염소진액/);
  assert.match(prompt, /제목에는 한려담원, 흑염소진액을 넣지 않는다/);
  assert.match(prompt, /5번 섹션 마지막에서만 허용/);
  assert.match(prompt, /가격, 구매 링크, 할인, 배송, 환불 유도 문구는 쓰지 않는다/);
});
