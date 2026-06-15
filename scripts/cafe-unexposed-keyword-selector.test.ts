import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDiverseSelection,
  inferKeywordTheme,
  isExposedStatus,
  parseCafeKeywordRows,
  selectDiverseUnexposedKeywords,
} from './cafe-unexposed-keyword-selector';

test('isExposedStatus treats only explicit exposure markers as exposed', () => {
  assert.equal(isExposedStatus('o'), true);
  assert.equal(isExposedStatus('상위노출'), true);
  assert.equal(isExposedStatus('완료'), true);
  assert.equal(isExposedStatus(''), false);
  assert.equal(isExposedStatus('미노출'), false);
});

test('inferKeywordTheme groups related miscarriage variants', () => {
  assert.equal(inferKeywordTheme('계류유산 후 재임신 확률'), '계류유산');
  assert.equal(inferKeywordTheme('6주 계류유산 증상'), '계류유산');
  assert.equal(inferKeywordTheme('화학적 유산 후 임신'), '화학적 유산');
  assert.equal(inferKeywordTheme('시험관 이식 후 출혈'), '시험관');
  assert.equal(inferKeywordTheme('나팔관조영술 후 관리'), '나팔관조영술');
  assert.equal(inferKeywordTheme('자궁근종 임신'), '자궁');
});

test('selectDiverseUnexposedKeywords skips exposed rows and caps themes per day and cafe', () => {
  const rows = parseCafeKeywordRows([
    ['키워드', '노출여부', '순위', '카페명', '조회수', '작성일', '링크'],
    ['계류유산 진단서'],
    ['계류유산 후 재임신'],
    ['계류유산 후 재임신 확률'],
    ['계류유산 후 자연임신', 'o'],
    ['화학적 유산 후 임신'],
    ['시험관 임테기 진하기'],
    ['자궁근종 임신'],
    ['갱년기 오한'],
    ['수족냉증 영양제'],
    ['흑염소진액 추천'],
    ['50대 엄마 선물'],
    ['공복혈당수치'],
    ['빈혈 증상'],
  ]);

  const slots = [
    { cafe: '건강한노후준비' },
    { cafe: '건강관리소' },
    { cafe: '쇼핑지름신' },
    { cafe: '건강한노후준비' },
    { cafe: '건강관리소' },
    { cafe: '쇼핑지름신' },
    { cafe: '건강한노후준비' },
    { cafe: '건강관리소' },
  ];

  const result = selectDiverseUnexposedKeywords(rows, slots, {
    maxPerThemePerDay: 2,
    maxPerThemePerCafe: 1,
  });

  assert.equal(result.selected.length, slots.length);
  assert.equal(result.skippedExposed, 1);
  assert.equal(result.themeCounts['계류유산'], 2);
  assert.equal(result.cafeThemeCounts['건강한노후준비']['계류유산'], 1);
  assert.equal(result.cafeThemeCounts['건강관리소']['계류유산'], 1);
  assert.ok(!result.selected.some(({ keyword }) => keyword === '계류유산 후 자연임신'));

  assertDiverseSelection(result.selected, {
    maxPerThemePerDay: 2,
    maxPerThemePerCafe: 1,
  });
});
