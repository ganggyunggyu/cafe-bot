export interface CafeKeywordRow {
  rowNumber: number;
  keyword: string;
  exposureStatus: string;
  rank: string;
  cafeName: string;
  views: string;
  writtenAt: string;
  link: string;
}

export interface AdKeywordSlot {
  cafe: string;
  cafeId?: string;
}

export interface SelectedCafeKeyword extends CafeKeywordRow {
  theme: string;
  assignedCafe: string;
  slotIndex: number;
}

export interface SelectDiverseKeywordOptions {
  maxPerThemePerDay?: number;
  maxPerThemePerCafe?: number;
  excludedKeywords?: Iterable<string>;
}

export interface SelectDiverseKeywordResult {
  selected: SelectedCafeKeyword[];
  skippedExposed: number;
  skippedDuplicate: number;
  skippedThemeLimit: number;
  themeCounts: Record<string, number>;
  cafeThemeCounts: Record<string, Record<string, number>>;
}

const EXPOSED_STATUS_VALUES = new Set([
  'o',
  'ok',
  'y',
  'yes',
  'true',
  '1',
  '노출',
  '상위노출',
  '완료',
]);

const THEME_PATTERNS: Array<{ theme: string; pattern: RegExp }> = [
  { theme: '계류유산', pattern: /계류\s*유산/ },
  { theme: '화학적 유산', pattern: /화학적\s*유산/ },
  { theme: '습관성 유산', pattern: /습관성\s*유산/ },
  { theme: '유산', pattern: /유산/ },
  { theme: '시험관', pattern: /시험관|배아|난자채취|피검|베타\s*수치|이식/ },
  { theme: '난임', pattern: /난임|인공수정|가임력/ },
  { theme: '자궁', pattern: /자궁|내막|근종|선근증|내막증/ },
  { theme: '난소', pattern: /난소|다낭성|배란|과배란/ },
  { theme: '나팔관조영술', pattern: /나팔관\s*조영술/ },
  { theme: '산후', pattern: /산후|산모|산후조리|제왕절개|자연분만/ },
  { theme: '출산', pattern: /출산|모유수유|수유부/ },
  { theme: '임신', pattern: /임신|착상|임테기|엽산|노산/ },
  { theme: '갱년기', pattern: /갱년기|폐경/ },
  { theme: '수족냉증', pattern: /수족냉증|손발|냉증|차가운|저체온/ },
  { theme: '흑염소', pattern: /흑염소|염소탕|염소즙|자라탕|녹용/ },
  { theme: '선물', pattern: /선물|생신|생일|환갑|기념일/ },
  { theme: '영양제', pattern: /영양제|비타민|오메가|아연|셀레늄|코엔자임|이노시톨/ },
  { theme: '혈당', pattern: /혈당|당뇨/ },
  { theme: '혈압', pattern: /혈압|고혈압/ },
  { theme: '콜레스테롤', pattern: /콜레스테롤|중성지방/ },
  { theme: '빈혈', pattern: /빈혈|철분/ },
  { theme: '피로', pattern: /피로|기력|원기|자양강장|몸보신|보양/ },
  { theme: '소화', pattern: /소화|위염|숙취/ },
  { theme: '골다공증', pattern: /골다공증|뼈/ },
  { theme: '성장', pattern: /성장|키즈|어린이|청소년|수험생|학생/ },
  { theme: '지역병원', pattern: /병원|의원|산부인과|조리원|도우미|한의원/ },
];

export const normalizeKeyword = (keyword: string): string =>
  keyword.replace(/\s+/g, '').trim().toLowerCase();

export const isExposedStatus = (value: string | undefined): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return EXPOSED_STATUS_VALUES.has(normalized);
};

export const inferKeywordTheme = (keyword: string): string => {
  const normalized = keyword.replace(/\s+/g, '');
  const matched = THEME_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  if (matched) return matched.theme;

  return normalized
    .replace(/(추천|효능|증상|원인|후기|검사|비용|방법|관리|기간|음식|선물)$/g, '')
    .slice(0, 12) || normalized;
};

export const parseCafeKeywordRows = (rows: string[][]): CafeKeywordRow[] =>
  rows.slice(1).flatMap((row, index) => {
    const keyword = (row[0] || '').trim();
    if (!keyword) return [];

    return [{
      rowNumber: index + 2,
      keyword,
      exposureStatus: (row[1] || '').trim(),
      rank: (row[2] || '').trim(),
      cafeName: (row[3] || '').trim(),
      views: (row[4] || '').trim(),
      writtenAt: (row[5] || '').trim(),
      link: (row[6] || '').trim(),
    }];
  });

const increment = (
  counts: Map<string, number>,
  key: string,
): void => {
  counts.set(key, (counts.get(key) || 0) + 1);
};

const toRecord = (counts: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));

export const selectDiverseUnexposedKeywords = (
  rows: CafeKeywordRow[],
  slots: AdKeywordSlot[],
  options: SelectDiverseKeywordOptions = {},
): SelectDiverseKeywordResult => {
  const maxPerThemePerDay = options.maxPerThemePerDay ?? 2;
  const maxPerThemePerCafe = options.maxPerThemePerCafe ?? 1;
  const excludedKeywords = new Set(
    [...(options.excludedKeywords || [])].map(normalizeKeyword),
  );

  let skippedExposed = 0;
  let skippedDuplicate = 0;
  let skippedThemeLimit = 0;

  const candidates = rows.flatMap((row) => {
    if (isExposedStatus(row.exposureStatus)) {
      skippedExposed++;
      return [];
    }

    return [{ ...row, theme: inferKeywordTheme(row.keyword) }];
  });

  const usedKeywords = new Set<string>(excludedKeywords);
  const usedRowNumbers = new Set<number>();
  const themeCounts = new Map<string, number>();
  const cafeThemeCounts = new Map<string, Map<string, number>>();
  const selected: SelectedCafeKeyword[] = [];

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex];
    let pickedIndex = -1;

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      if (usedRowNumbers.has(candidate.rowNumber)) continue;

      const normalizedKeyword = normalizeKeyword(candidate.keyword);
      if (usedKeywords.has(normalizedKeyword)) {
        skippedDuplicate++;
        continue;
      }

      const themeCount = themeCounts.get(candidate.theme) || 0;
      const cafeCounts = cafeThemeCounts.get(slot.cafe) || new Map<string, number>();
      const cafeThemeCount = cafeCounts.get(candidate.theme) || 0;
      if (
        themeCount >= maxPerThemePerDay ||
        cafeThemeCount >= maxPerThemePerCafe
      ) {
        skippedThemeLimit++;
        continue;
      }

      pickedIndex = index;
      break;
    }

    if (pickedIndex < 0) {
      throw new Error(
        `미노출 키워드 다양화 실패: ${slots.length}개 슬롯 중 ${slotIndex + 1}번째 슬롯(${slot.cafe})을 채울 후보가 부족합니다.`,
      );
    }

    const picked = candidates[pickedIndex];
    usedRowNumbers.add(picked.rowNumber);
    usedKeywords.add(normalizeKeyword(picked.keyword));
    increment(themeCounts, picked.theme);

    const cafeCounts = cafeThemeCounts.get(slot.cafe) || new Map<string, number>();
    increment(cafeCounts, picked.theme);
    cafeThemeCounts.set(slot.cafe, cafeCounts);

    selected.push({
      ...picked,
      assignedCafe: slot.cafe,
      slotIndex,
    });
  }

  return {
    selected,
    skippedExposed,
    skippedDuplicate,
    skippedThemeLimit,
    themeCounts: toRecord(themeCounts),
    cafeThemeCounts: Object.fromEntries(
      [...cafeThemeCounts.entries()].map(([cafe, counts]) => [cafe, toRecord(counts)]),
    ),
  };
};

export const assertDiverseSelection = (
  selected: SelectedCafeKeyword[],
  options: Required<Pick<SelectDiverseKeywordOptions, 'maxPerThemePerDay' | 'maxPerThemePerCafe'>>,
): void => {
  const themeCounts = new Map<string, number>();
  const cafeThemeCounts = new Map<string, Map<string, number>>();
  const keywords = new Set<string>();

  for (const item of selected) {
    const normalizedKeyword = normalizeKeyword(item.keyword);
    if (keywords.has(normalizedKeyword)) {
      throw new Error(`중복 키워드 선택됨: ${item.keyword}`);
    }
    keywords.add(normalizedKeyword);

    increment(themeCounts, item.theme);
    const cafeCounts = cafeThemeCounts.get(item.assignedCafe) || new Map<string, number>();
    increment(cafeCounts, item.theme);
    cafeThemeCounts.set(item.assignedCafe, cafeCounts);
  }

  for (const [theme, count] of themeCounts) {
    if (count > options.maxPerThemePerDay) {
      throw new Error(`주제군 일일 한도 초과: ${theme} ${count}/${options.maxPerThemePerDay}`);
    }
  }

  for (const [cafe, counts] of cafeThemeCounts) {
    for (const [theme, count] of counts) {
      if (count > options.maxPerThemePerCafe) {
        throw new Error(`카페별 주제군 한도 초과: ${cafe} ${theme} ${count}/${options.maxPerThemePerCafe}`);
      }
    }
  }
};
