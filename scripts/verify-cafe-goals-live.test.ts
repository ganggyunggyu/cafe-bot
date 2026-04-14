import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLiveDaySummary,
  filterOwnedArticlesByDate,
} from './verify-cafe-goals-live';

test('filterOwnedArticlesByDate uses KST date and eligible nicknames', () => {
  const articles = [
    {
      articleId: 1,
      subject: '전일 막차',
      nickname: '달리자',
      memberKey: 'member-a',
      maskedMemberId: 'uqgi******',
      writeDateTimestamp: Date.parse('2026-04-13T14:50:00.000Z'),
    },
    {
      articleId: 2,
      subject: '자정 넘김',
      nickname: '달리자',
      memberKey: 'member-a',
      maskedMemberId: 'uqgi******',
      writeDateTimestamp: Date.parse('2026-04-13T23:01:21.959Z'),
    },
    {
      articleId: 3,
      subject: '남의 글',
      nickname: '외부회원',
      memberKey: 'member-b',
      maskedMemberId: 'outs****',
      writeDateTimestamp: Date.parse('2026-04-13T10:00:00.000Z'),
    },
    {
      articleId: 4,
      subject: '아이디 마스킹 매치',
      nickname: '카페별닉네임',
      memberKey: 'member-a',
      maskedMemberId: 'uqgi******',
      writeDateTimestamp: Date.parse('2026-04-13T10:00:00.000Z'),
    },
  ];

  assert.deepEqual(
    filterOwnedArticlesByDate(articles, new Set(['member-a']), '2026-04-13').map(({ articleId }) => articleId),
    [4, 1],
  );

  assert.deepEqual(
    filterOwnedArticlesByDate(articles, new Set(['member-a']), '2026-04-14').map(({ articleId }) => articleId),
    [2],
  );
});

test('buildLiveDaySummary compares actual posts against preset target', () => {
  const summary = buildLiveDaySummary('2026-04-13', [
    {
      articleId: 10,
      subject: '첫 글',
      nickname: '힘차게',
      writeDateTimestamp: Date.parse('2026-04-13T09:00:00.000Z'),
    },
    {
      articleId: 11,
      subject: '둘째 글',
      nickname: '달리자',
      writeDateTimestamp: Date.parse('2026-04-13T10:00:00.000Z'),
    },
  ], {
    value: 3,
    source: 'preset',
    note: '기본 운영 목표치',
  }, {
    coverageComplete: true,
    identityExpected: 2,
    identityResolved: 2,
    collectionErrors: [],
  });

  assert.equal(summary.actualPosts, 2);
  assert.equal(summary.targetStatus, 'fail');
  assert.equal(summary.diffFromTarget, -1);
  assert.equal(summary.statusReason, '목표 미달');
  assert.deepEqual(summary.writerBreakdown, [
    { nickname: '달리자', posts: 1 },
    { nickname: '힘차게', posts: 1 },
  ]);
});

test('buildLiveDaySummary returns unknown when date coverage is incomplete', () => {
  const summary = buildLiveDaySummary('2026-04-13', [], {
    value: 15,
    source: 'preset',
    note: '기본 운영 목표치',
  }, {
    coverageComplete: false,
    identityExpected: 5,
    identityResolved: 5,
    collectionErrors: [],
  });

  assert.equal(summary.targetStatus, 'unknown');
  assert.equal(summary.diffFromTarget, null);
  assert.equal(summary.statusReason, '조회 범위가 날짜 끝까지 내려가지 않음');
});

test('buildLiveDaySummary returns unknown when writer identities are partial', () => {
  const summary = buildLiveDaySummary('2026-04-13', [
    {
      articleId: 21,
      subject: '한 건',
      nickname: '레전드뽀또',
      writeDateTimestamp: Date.parse('2026-04-13T09:00:00.000Z'),
    },
  ], {
    value: 10,
    source: 'preset',
    note: '기본 운영 목표치',
  }, {
    coverageComplete: true,
    identityExpected: 5,
    identityResolved: 3,
    collectionErrors: [],
  });

  assert.equal(summary.targetStatus, 'unknown');
  assert.equal(summary.statusReason, 'writer identity 3/5만 확인됨');
});

test('buildLiveDaySummary returns unknown when collection error exists', () => {
  const summary = buildLiveDaySummary('2026-04-13', [], {
    value: 12,
    source: 'preset',
    note: '기본 운영 목표치',
  }, {
    coverageComplete: true,
    identityExpected: 4,
    identityResolved: 4,
    collectionErrors: ['글 목록 조회 실패'],
  });

  assert.equal(summary.targetStatus, 'unknown');
  assert.equal(summary.statusReason, '글 목록 조회 실패');
});
