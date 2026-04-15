import assert from 'node:assert/strict';
import test from 'node:test';

import { extractArticleIdFromUrl, findRecentArticleBySubject } from './post-writer';

test('extractArticleIdFromUrl returns articleId from direct article url', () => {
  const articleId = extractArticleIdFromUrl(
    'https://cafe.naver.com/ca-fe/cafes/25227349/articles/1109'
  );

  assert.equal(articleId, 1109);
});

test('extractArticleIdFromUrl returns articleId from double-encoded iframe url', () => {
  const nestedUrl =
    'https://cafe.naver.com/MyCafe?iframe_url_utf8=' +
    encodeURIComponent(
      encodeURIComponent('/ArticleRead.nhn?clubid=25227349&articleid=1109')
    );

  const articleId = extractArticleIdFromUrl(nestedUrl);

  assert.equal(articleId, 1109);
});

test('extractArticleIdFromUrl returns undefined for write url', () => {
  const articleId = extractArticleIdFromUrl(
    'https://cafe.naver.com/ca-fe/cafes/25227349/articles/write?boardType=L&menuId=1'
  );

  assert.equal(articleId, undefined);
});

test('findRecentArticleBySubject prefers a newly appeared article', () => {
  const articles = [
    {
      articleId: 1085,
      subject: '우리아이예상키',
      writeDateTimestamp: 1_000,
      menuId: 1,
    },
    {
      articleId: 1109,
      subject: '우리아이예상키',
      writeDateTimestamp: 2_000,
      menuId: 1,
    },
  ];

  const match = findRecentArticleBySubject(articles, '우리아이예상키', {
    knownArticleIds: new Set([1085]),
    publishStartedAt: 1_900,
    menuId: 1,
  });

  assert.ok(match);
  assert.equal(match.articleId, 1109);
});
