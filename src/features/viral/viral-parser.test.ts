import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommentStats, parseViralResponse } from './viral-parser';

test('parseViralResponse keeps multiline comment bodies under the current comment block', () => {
  const parsed = parseViralResponse(`
[제목]
테스트 제목

[본문]
본문 첫 줄
본문 둘째 줄

[댓글1]
첫 댓글 첫 줄
첫 댓글 둘째 줄
[작성자-1]
답글 첫 줄
[댓글2]
둘째 댓글
`);

  assert.ok(parsed);
  assert.equal(parsed.title, '테스트 제목');
  assert.equal(parsed.body, '본문 첫 줄\n본문 둘째 줄');
  assert.equal(parsed.comments.length, 3);
  assert.equal(parsed.comments[0].type, 'comment');
  assert.equal(parsed.comments[0].content, '첫 댓글 첫 줄\n첫 댓글 둘째 줄');
  assert.equal(parsed.comments[1].type, 'author_reply');
  assert.equal(parsed.comments[1].parentIndex, 1);
  assert.equal(parsed.comments[1].content, '답글 첫 줄');
  assert.equal(parsed.comments[2].type, 'comment');
  assert.equal(parsed.comments[2].content, '둘째 댓글');
});

test('getCommentStats counts comment types from parsed comments', () => {
  const parsed = parseViralResponse(`
[제목]
제목

[본문]
본문

[댓글1] 일반 댓글
[작성자-1] 답글
[댓글러-1] 재답글
[제3자-1] 제3자 답글
`);

  assert.ok(parsed);
  assert.deepEqual(getCommentStats(parsed.comments), {
    authorReply: 1,
    comment: 1,
    commenterReply: 1,
    otherReply: 1,
    total: 4,
  });
});
