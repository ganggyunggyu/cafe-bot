/**
 * 카페 스케줄 템플릿의 광고 키워드를 카페키워드 시트 미노출 후보로 다양화한다.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/diversify-cafe-schedule-keywords.ts \
 *     --template scripts/artifacts/cafe-schedule-YYYY-MM-DD-template.json \
 *     --output scripts/artifacts/cafe-schedule-YYYY-MM-DD-unexposed-diverse.json
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

import {
  assertDiverseSelection,
  parseCafeKeywordRows,
  selectDiverseUnexposedKeywords,
  type AdKeywordSlot,
} from './cafe-unexposed-keyword-selector';

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  keyword: string;
  category: string;
  type: 'ad' | 'daily' | 'daily-ad';
  keywordType?: 'own' | 'competitor' | 'competitor-advocacy';
  accountId: string;
  time: string;
}

interface CliOptions {
  template: string;
  output: string;
  summary: string;
  sheetId: string;
  sheetTab: string;
  maxPerThemePerDay: number;
  maxPerThemePerCafe: number;
}

const DEFAULT_SHEET_ID = '1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms';
const DEFAULT_SHEET_TAB = '카페키워드';

const parseArgs = (args: string[]): CliOptions => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    values.set(arg.slice(2), args[index + 1] || '');
    index++;
  }

  const template = values.get('template') || '';
  if (!template) throw new Error('--template is required');

  const output = values.get('output') || template.replace(/\.json$/, '.unexposed-diverse.json');

  return {
    template,
    output,
    summary: values.get('summary') || output.replace(/\.json$/, '.summary.json'),
    sheetId: values.get('sheet-id') || DEFAULT_SHEET_ID,
    sheetTab: values.get('sheet-tab') || DEFAULT_SHEET_TAB,
    maxPerThemePerDay: Number(values.get('max-theme-day') || 2),
    maxPerThemePerCafe: Number(values.get('max-theme-cafe') || 1),
  };
};

const getKstNow = (): string =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()).replace('T', ' ');

const readSheetValues = async (
  spreadsheetId: string,
  sheetTab: string,
): Promise<string[][]> => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!email || !rawKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY missing');
  }

  const auth = new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTab}!A:G`,
  });

  return (response.data.values || []) as string[][];
};

const readSchedule = (filePath: string): ScheduleItem[] => {
  const schedule = JSON.parse(readFileSync(filePath, 'utf8')) as ScheduleItem[];
  if (!Array.isArray(schedule)) {
    throw new Error(`schedule template must be an array: ${filePath}`);
  }
  return schedule;
};

const replaceAdKeywords = (
  schedule: ScheduleItem[],
  slots: AdKeywordSlot[],
  selectedKeywords: ReturnType<typeof selectDiverseUnexposedKeywords>['selected'],
): ScheduleItem[] => {
  let adIndex = 0;
  return schedule.map((item) => {
    if (item.type !== 'ad') return item;

    const selected = selectedKeywords[adIndex];
    const slot = slots[adIndex];
    adIndex++;

    if (!selected || !slot) {
      throw new Error('selected keyword count does not match ad slot count');
    }

    return {
      ...item,
      keyword: selected.keyword,
      keywordType: 'own',
    };
  });
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const schedule = readSchedule(options.template);
  const adSlots = schedule
    .filter((item) => item.type === 'ad')
    .map((item) => ({ cafe: item.cafe, cafeId: item.cafeId }));

  if (adSlots.length === 0) {
    throw new Error('template has no ad slots');
  }

  const sheetRows = parseCafeKeywordRows(await readSheetValues(options.sheetId, options.sheetTab));
  const result = selectDiverseUnexposedKeywords(sheetRows, adSlots, {
    maxPerThemePerDay: options.maxPerThemePerDay,
    maxPerThemePerCafe: options.maxPerThemePerCafe,
  });

  assertDiverseSelection(result.selected, {
    maxPerThemePerDay: options.maxPerThemePerDay,
    maxPerThemePerCafe: options.maxPerThemePerCafe,
  });

  const updatedSchedule = replaceAdKeywords(schedule, adSlots, result.selected);
  writeFileSync(options.output, `${JSON.stringify(updatedSchedule, null, 2)}\n`, 'utf8');

  const summary = {
    generatedAtKst: getKstNow(),
    sourceSheet: `한려담원 카페 / ${options.sheetTab}!A:G`,
    sourceSpreadsheetId: options.sheetId,
    template: path.relative(process.cwd(), options.template),
    output: path.relative(process.cwd(), options.output),
    candidates: {
      totalRows: sheetRows.length,
      skippedExposed: result.skippedExposed,
      selectedUnexposed: result.selected.length,
      fallback: 0,
    },
    diversityPolicy: {
      maxPerThemePerDay: options.maxPerThemePerDay,
      maxPerThemePerCafe: options.maxPerThemePerCafe,
    },
    themeCounts: result.themeCounts,
    cafeThemeCounts: result.cafeThemeCounts,
    selectedAdKeywords: result.selected.map((item) => ({
      rowNumber: item.rowNumber,
      keyword: item.keyword,
      theme: item.theme,
      assignedCafe: item.assignedCafe,
    })),
  };
  writeFileSync(options.summary, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`source: ${summary.sourceSheet}`);
  console.log(`ad slots: ${adSlots.length}`);
  console.log(`selected unexposed: ${result.selected.length}`);
  console.log(`theme max/day: ${options.maxPerThemePerDay}, theme max/cafe: ${options.maxPerThemePerCafe}`);
  console.log(`output: ${options.output}`);
  console.log(`summary: ${options.summary}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
