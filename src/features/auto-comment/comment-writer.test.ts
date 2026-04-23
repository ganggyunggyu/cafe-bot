import assert from 'node:assert/strict';
import test from 'node:test';

import { isNicknameEquivalent } from './comment-writer-utils';

test('isNicknameEquivalent ignores whitespace differences', () => {
  assert.equal(isNicknameEquivalent('오늘도즐겁게', '오늘도 즐겁게'), true);
});

test('isNicknameEquivalent keeps mismatched nicknames distinct', () => {
  assert.equal(isNicknameEquivalent('오늘도즐겁게', '하준리뷰'), false);
});
