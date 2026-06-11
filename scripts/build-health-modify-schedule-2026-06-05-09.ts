import { writeFileSync } from "fs";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { PublishedArticle } from "../src/shared/models";

dotenv.config({ path: ".env.local" });

const TARGET_CAFE_IDS = ["25227349", "25636798"];
const START = new Date("2026-06-05T00:00:00+09:00");
const END = new Date("2026-06-10T00:00:00+09:00");
const OUTPUT_FILE =
  "scripts/artifacts/health-modify-schedule-2026-06-05-09.json";
const SUMMARY_FILE =
  "scripts/artifacts/health-modify-schedule-2026-06-05-09.summary.json";

const RAW_KEYWORDS = `
흑염소진액
임산부선물
엄마생신선물
철분많은음식
콜레스테롤 낮추는 음식
생강차
아빠생일선물
생강효능
단백질많은음식
코엔자임큐텐
대추차
어린이영양제
쌍화차
출산선물
생신선물
환갑선물
30대남자선물
엄마선물
침향환
시어머니생신선물
아버지생신선물
50대여자선물
50대 여자 선물
50대여자선물추천
부모님생신선물
공진단가격
40대남자선물
염소탕
부모님선물
생강차효능
40대 여자 선물
40대여자선물
50대 엄마 생신선물
50대엄마생신선물
아버지선물
아빠선물
와이프 생일선물
결혼기념일 선물
장어즙
영지버섯
브라질너트
60대 엄마 생신선물
60대엄마생신선물
60대엄마생일선물
키즈영양제
장모님 선물
장모님선물
장모님생신선물
선생님선물
홍삼스틱
50대 남자 선물
50대남자선물
어머님생신선물
부모님생일선물
부모님첫인사선물
시어머니선물
시어머님 생신선물
키크는음식
아버지환갑선물
시아버지생신선물
시아버님 생신선물
엄마 환갑 선물
엄마환갑선물
햇생강
계피차
감마리놀렌산
40대남자생일선물
자양강장제
대추청
아빠환갑선물
수험생영양제
장어진액
장인어른 선물
생강즙
영양제추천
출산선물추천
차종류
정읍쌍화차
고혈압음식
쌍화차효능
60대여자선물
어르신선물
부모님결혼기념일선물
원기회복 음식
자양강장
출산선물세트
몸보신음식
참다한홍삼
쑥차
살찌는음식
면역력높이는방법
임신에 좋은 음식
임신에좋은음식
키즈홍삼
붓기차
건강차
정년퇴직선물
종합영양제추천
흑염소탕 효능
흑염소탕효능
흑염소고기
50대아빠생일선물
한방차
산모음식
50대여성선물
퀘르세틴브로멜라인
흑염소진액 추천
흑염소진액추천
아버님생신선물
코스트코오메가3
초등학생 영양제
장어즙효능
중학생 영양제
중학생영양제
이노시톨추천
할머니생신선물
계피스틱
임산부종합비타민
40대 남편 생일선물
50대남자생일선물
몸에좋은음식
블랙마카추천
활성엽산
장인어른 생신선물
장인어른생신선물
남편결혼기념일선물
계피차효능
60대아버지생신선물
출산후 좋은 음식
출산후좋은음식
엽산추천
60대선물
수험생선물
60대엄마선물
대추생강차
생강대추차
생칡즙
출산산모선물
출산후산모선물
산모출산선물
쌍화탕재료
여자친구부모님첫인사선물
소음인음식
아내출산선물
작약차
남자엽산
도라지생강청
쌍화차재료
올인원비타민
당귀차
50대선물
흑염소 한마리 가격
흑염소가격
할아버지선물
말린생강
70대선물
남자친구부모님선물
키즈아연
고단백질음식
녹용추천
할아버지생신선물
60대아빠선물
60대남자선물
천담온 흑염소진액
부모님인사선물
김오곤흑염소
블러드케어
둘째 임신
혈행개선영양제
시부모님선물
어린이아연
생강청효능
임산부멀티비타민
젤리스틱
천연종합비타민
아기아연
올인원영양제
이노시톨영양제
80대할머니선물
임신준비선물
흙염소진액
녹용가격
실론시나몬
대추가격
고등학생 영양제
고등학생영양제
40대선물
건강식품선물
비타민B음식
수험생비타민
먹는알로에
할머니선물추천
셀레늄음식
50대생일선물
보양식추천
60대남자생일선물
수제쌍화차
혈행케어
피로회복 음료
피로회복에좋은음식
시나몬차
한살림흑염소
셀레늄영양제
활성엽산추천
대추생강차효능
비타민D츄어블
도라지생강차
아연많은음식
아연이많은음식
홍삼즙
얼굴살찌는법
노인영양제
출산후선물
어린이 면역력 영양제
겨울보양식
다낭성이노시톨
원기회복음식
몸보신메뉴
녹용흑염소
계피생강차
생강계피차
청소년종합비타민
이뮨젤리
산모에게좋은과일
염소가격
겨울철보양식
활성엽산800
몸을따뜻하게하는음식
기력없을때
남자아연
모유수유좋은음식
생강레몬차
활성엽산400
토종흑염소진액
기력회복음식
마시는샐러드
40대엄마생일선물
생강차스틱
산모에게좋은음식
산모에게 좋은 음식
엽산800
임산부에게좋은음식
산후조리 음식
산후조리음식
기력회복에 좋은 음식
기력회복에좋은음식
몸을따뜻하게하는차
생강쌍화
유기농레몬생강즙
건강강
울릉도흑염소
마가목흑염소
홍성호흑염소
울릉도마가목흑염소
`;

type ScheduleItem = {
  link: string;
  keyword: string;
  keywordType: "own";
};

type ArticleSummary = {
  cafeId: string;
  articleId: number;
  status: string;
  publishedAt: string;
  assignedKeyword: string;
};

const normalizeKeywords = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  );

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const shuffle = <T>(items: T[], seed: number): T[] => {
  const random = createRandom(seed);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
};

const toCafeLink = (cafeId: string, articleId: number): string =>
  `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

const toKstDate = (date: Date): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const increment = (map: Record<string, number>, key: string): void => {
  map[key] = (map[key] || 0) + 1;
};

const main = async (): Promise<void> => {
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI missing");
  }

  const keywords = normalizeKeywords(RAW_KEYWORDS);
  if (keywords.length === 0) {
    throw new Error("keyword pool is empty");
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const articles = await PublishedArticle.find({
    cafeId: { $in: TARGET_CAFE_IDS },
    publishedAt: { $gte: START, $lt: END },
  })
    .sort({ cafeId: 1, publishedAt: 1, articleId: 1 })
    .lean();

  const shuffledKeywords = shuffle(keywords, 20260611);
  const schedule: ScheduleItem[] = articles.map((article, index) => ({
    link:
      article.articleUrl ||
      toCafeLink(article.cafeId, Number(article.articleId)),
    keyword: shuffledKeywords[index % shuffledKeywords.length],
    keywordType: "own",
  }));

  const byCafe: Record<string, number> = {};
  const byCafeDate: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const assignedArticles: ArticleSummary[] = [];

  for (let index = 0; index < articles.length; index++) {
    const article = articles[index];
    const publishedAt =
      article.publishedAt instanceof Date
        ? article.publishedAt
        : new Date(article.publishedAt);
    const cafeId = String(article.cafeId);

    increment(byCafe, cafeId);
    increment(byCafeDate, `${cafeId}/${toKstDate(publishedAt)}`);
    increment(byStatus, String(article.status || "unknown"));

    assignedArticles.push({
      cafeId,
      articleId: Number(article.articleId),
      status: String(article.status || "unknown"),
      publishedAt: publishedAt.toISOString(),
      assignedKeyword: schedule[index].keyword,
    });
  }

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(schedule, null, 2)}\n`);
  writeFileSync(
    SUMMARY_FILE,
    `${JSON.stringify(
      {
        total: schedule.length,
        keywordPoolUniqueCount: keywords.length,
        dateRangeKst: {
          start: "2026-06-05",
          endInclusive: "2026-06-09",
        },
        cafeIds: TARGET_CAFE_IDS,
        byCafe,
        byCafeDate,
        byStatus,
        assignedArticles,
      },
      null,
      2
    )}\n`
  );

  console.log(`schedule: ${OUTPUT_FILE}`);
  console.log(`summary: ${SUMMARY_FILE}`);
  console.log(
    JSON.stringify(
      {
        total: schedule.length,
        keywordPoolUniqueCount: keywords.length,
        byCafe,
        byCafeDate,
        byStatus,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
