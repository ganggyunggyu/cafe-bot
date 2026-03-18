/**
 * 스케줄 큐 추가 스크립트
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-schedule.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
import {
  browseCafePosts,
  pickRandomArticles,
} from "../src/shared/lib/cafe-browser";
import { readCafeArticleContent } from "../src/shared/lib/cafe-article-reader";
import { generateComment } from "../src/shared/api/comment-gen-api";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type {
  PostJobData,
  CommentJobData,
  LikeJobData,
  ViralCommentsData,
} from "../src/shared/lib/queue/types";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const SIDE_ACTIVITY_BUFFER_MS = 3 * 60 * 1000;

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  keyword: string;
  category: string;
  type: "ad" | "daily";
  accountId: string;
  time: string; // "HH:MM"
}

const SCHEDULE: ScheduleItem[] = [
  // 2026-03-17 재실행: 쇼핑 ad10+daily4, 샤넬 ad7+daily3, 건노 ad13, 건관 ad13 = 50건 (dyulp 제외, 발행완료 11건 제외)
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "울릉도 흑염소", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "20:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "울릉도 흑염소", category: "자유게시판", type: "ad", accountId: "fail5644", time: "20:04" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "울릉도 마가목 흑염소", category: "흑염소진액정보", type: "ad", accountId: "compare14310", time: "20:07" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "울릉도 흑염소", category: "_ 일상샤반사 📆", type: "ad", accountId: "ags2oigb", time: "20:11" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "울릉도 흑염소", category: "취미이야기", type: "ad", accountId: "compare14310", time: "20:15" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "홍성호 흑염소", category: "일반 쇼핑후기", type: "ad", accountId: "fail5644", time: "20:18" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "울릉도 마가목 흑염소", category: "건강이야기", type: "ad", accountId: "loand3324", time: "20:22" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클라이맥스 나나 립컬러 뭔지 궁금해서 찾아보는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "ags2oigb", time: "20:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "홍성호 흑염소", category: "한약재정보", type: "ad", accountId: "loand3324", time: "20:29" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "홍성호 흑염소", category: "자유로운이야기", type: "ad", accountId: "fail5644", time: "20:33" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "골다공증수치", category: "일반 쇼핑후기", type: "ad", accountId: "compare14310", time: "20:36" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "홍성호 울릉도 마가목 흑염소", category: "자유게시판", type: "ad", accountId: "ags2oigb", time: "20:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "홍성호 흑염소", category: "_ 일상샤반사 📆", type: "ad", accountId: "loand3324", time: "20:43" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임산부 잉어즙", category: "흑염소진액정보", type: "ad", accountId: "fail5644", time: "20:47" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "홍성호 울릉도 마가목 흑염소", category: "자유로운이야기", type: "ad", accountId: "compare14310", time: "20:51" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "영지버섯 효능", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "20:54" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 세일 글로우 세럼파운데이션 득템 후기", category: "일상톡톡", type: "daily", accountId: "loand3324", time: "20:58" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "손발저림 영양제", category: "_ 일상샤반사 📆", type: "ad", accountId: "fail5644", time: "21:01" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "가임력 검사", category: "흑염소진액정보", type: "ad", accountId: "compare14310", time: "21:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "배란일 임신 확률", category: "건강이야기", type: "ad", accountId: "ags2oigb", time: "21:09" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신준비 한약", category: "자유로운이야기", type: "ad", accountId: "loand3324", time: "21:12" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임산부비타민", category: "일반 쇼핑후기", type: "ad", accountId: "fail5644", time: "21:16" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "키성장영양제", category: "_ 일상샤반사 📆", type: "ad", accountId: "compare14310", time: "21:19" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "남자 임신 준비", category: "건강상식", type: "ad", accountId: "ags2oigb", time: "21:23" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "사랑하는남자는모두죽는다 위하준 코트 브랜드 찾는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "loand3324", time: "21:27" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "난임 한약 비용", category: "건강 챌린지", type: "ad", accountId: "fail5644", time: "21:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "염소즙", category: "일반 쇼핑후기", type: "ad", accountId: "compare14310", time: "21:34" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "노산 기형아 예방", category: "건강 관리 후기", type: "ad", accountId: "ags2oigb", time: "21:37" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "나팔관조영술 통증", category: "건강정보", type: "ad", accountId: "loand3324", time: "21:41" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "혈관에 좋은 영양제", category: "일반 쇼핑후기", type: "ad", accountId: "fail5644", time: "21:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "노산 검사 항목", category: "건강 챌린지", type: "ad", accountId: "compare14310", time: "21:48" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산모에게좋은음식", category: "건강상식", type: "ad", accountId: "ags2oigb", time: "21:52" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "면역력높이는음식", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "21:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "45살 임신 확률", category: "취미이야기", type: "ad", accountId: "fail5644", time: "21:59" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "계류유산 원인", category: "한약재정보", type: "ad", accountId: "compare14310", time: "22:03" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "40살 임신 확률", category: "건강 관리 후기", type: "ad", accountId: "ags2oigb", time: "22:06" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "한달에 생리 세번", category: "건강정보", type: "ad", accountId: "loand3324", time: "22:10" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에스트로겐", category: "_ 일상샤반사 📆", type: "ad", accountId: "fail5644", time: "22:13" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "손가락저림", category: "_ 일상샤반사 📆", type: "ad", accountId: "compare14310", time: "22:17" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "41세 임신 확률", category: "질문게시판", type: "ad", accountId: "ags2oigb", time: "22:21" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "팔다리저림", category: "_ 일상샤반사 📆", type: "ad", accountId: "loand3324", time: "22:24" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "남자 노산 나이", category: "질문게시판", type: "ad", accountId: "fail5644", time: "22:28" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "스타벅스 봄시즌 벚꽃라떼 오늘 출시 바로 먹어봄", category: "_ 일상샤반사 📆", type: "daily", accountId: "compare14310", time: "22:31" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "공복혈당수치", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "22:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "콜레스테롤 약", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "22:39" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "사랑하는남자는모두죽는다 박민영 위하준 1회 소름돋음", category: "일상톡톡", type: "daily", accountId: "fail5644", time: "22:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 봄 신상 스프링니트 장바구니 3만원 넘김", category: "일상톡톡", type: "daily", accountId: "compare14310", time: "22:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "클라이맥스 주지훈 하지원 케미 퇴근 후 정주행", category: "일상톡톡", type: "daily", accountId: "ags2oigb", time: "22:49" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "과배란주사", category: "오늘의 운동", type: "ad", accountId: "loand3324", time: "22:53" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "남자임신준비", category: "오늘의 운동", type: "ad", accountId: "fail5644", time: "23:00" },
];

const COMMENT_TEMPLATES = [
  "좋은 정보 감사합니다. 참고해볼게요.",
  "저도 비슷하게 느꼈는데 정리 잘해주셨네요.",
  "경험 공유 감사합니다. 도움이 됐어요.",
  "내용이 깔끔해서 이해하기 편했어요.",
  "실사용 관점에서 도움 되는 글이네요.",
  "핵심만 잘 정리돼서 바로 참고했어요.",
  "저랑 상황이 비슷해서 공감하면서 읽었습니다.",
  "정성글 감사합니다. 다음 글도 기대할게요.",
];

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const getDelayMs = (timeStr: string): number => {
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const delay = target.getTime() - Date.now();
  return Math.max(delay, 0);
};

const generateSmartComment = async (
  writer: NaverAccount,
  cafeId: string,
  articleId: number,
  fallbackIndex: number,
): Promise<string> => {
  const fallback = COMMENT_TEMPLATES[fallbackIndex % COMMENT_TEMPLATES.length];
  try {
    const article = await readCafeArticleContent(writer, cafeId, articleId);
    if (!article.success || !article.content) return fallback;
    const postContext = article.title
      ? `${article.title}\n\n${article.content}`
      : article.content;
    const generated = await generateComment(
      postContext,
      null,
      article.authorNickname,
    );
    return generated.trim() || fallback;
  } catch {
    return fallback;
  }
};

const addSideActivityJobs = async (
  writer: { accountId: string; password: string; nickname?: string },
  cafeId: string,
  menuId: string,
  baseDelay: number,
  idx: number,
  commentableMenuIds?: number[],
): Promise<{ comments: number; likes: number }> => {
  const naverAccount: NaverAccount = {
    id: writer.accountId,
    password: writer.password,
    nickname: writer.nickname,
  };

  const useCommentableFilter =
    commentableMenuIds && commentableMenuIds.length > 0;
  const browseMenuId = useCommentableFilter ? undefined : Number(menuId);
  const browse = await browseCafePosts(naverAccount, cafeId, browseMenuId, {
    perPage: 40,
  });
  if (!browse.success || browse.articles.length === 0) {
    console.log(`    사이드: 글 없음 - 스킵`);
    return { comments: 0, likes: 0 };
  }

  const menuFilteredSet = useCommentableFilter
    ? new Set(commentableMenuIds)
    : null;
  const menuFiltered = menuFilteredSet
    ? browse.articles.filter((a) => menuFilteredSet.has(a.menuId))
    : browse.articles;

  const filtered = writer.nickname
    ? menuFiltered.filter((a) => a.nickname !== writer.nickname)
    : menuFiltered;
  const pool =
    filtered.length > 0
      ? filtered
      : menuFiltered.length > 0
        ? menuFiltered
        : browse.articles;

  let commentCount = 0;
  let likeCount = 0;

  const commentTargets = pickRandomArticles(pool, Math.min(2, pool.length));
  for (let i = 0; i < commentTargets.length; i++) {
    const target = commentTargets[i];
    const commentText = await generateSmartComment(
      naverAccount,
      cafeId,
      target.articleId,
      idx + i,
    );
    const delay = baseDelay + i * SIDE_ACTIVITY_BUFFER_MS;
    const commentJob: CommentJobData = {
      type: "comment",
      accountId: writer.accountId,
      cafeId,
      articleId: target.articleId,
      content: commentText,
    };
    await addTaskJob(writer.accountId, commentJob, delay);
    commentCount++;
    console.log(
      `    사이드 댓글 #${target.articleId} (딜레이: ${Math.round(delay / 60000)}분)`,
    );
  }

  const commentedIds = new Set(commentTargets.map((t) => t.articleId));
  const likePool = pool.filter((a) => !commentedIds.has(a.articleId));
  const likeTargets = pickRandomArticles(
    likePool.length > 0 ? likePool : pool,
    1,
  );

  for (const target of likeTargets) {
    const delay = baseDelay + commentTargets.length * SIDE_ACTIVITY_BUFFER_MS;
    const likeJob: LikeJobData = {
      type: "like",
      accountId: writer.accountId,
      cafeId,
      articleId: target.articleId,
    };
    await addTaskJob(writer.accountId, likeJob, delay);
    likeCount++;
    console.log(
      `    사이드 좋아요 #${target.articleId} (딜레이: ${Math.round(delay / 60000)}분)`,
    );
  }

  return { comments: commentCount, likes: likeCount };
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c]));

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  const commenterIds = accounts
    .filter((a) => a.role === "commenter")
    .map((a) => a.accountId);

  console.log(`=== 스케줄 큐 추가 ===`);
  console.log(
    `user: ${LOGIN_ID} / writers: ${SCHEDULE.length}건 / commenters: ${commenterIds.length}명\n`,
  );

  let totalPosts = 0;
  let failCount = 0;
  let totalSideComments = 0;
  let totalSideLikes = 0;

  const sortedSchedule = [...SCHEDULE].sort((a, b) =>
    a.time.localeCompare(b.time),
  );

  // 사이드 활동 추적 (계정+카페 조합별 1회)
  const sideActivityDone = new Set<string>();

  for (const item of sortedSchedule) {
    const delayMs = getDelayMs(item.time);
    const cafe = cafeMap.get(item.cafeId);
    if (!cafe) {
      console.log(`❌ 카페 없음: ${item.cafeId}`);
      failCount++;
      continue;
    }

    const account = accountMap.get(item.accountId);
    if (!account) {
      console.log(`❌ 계정 없음: ${item.accountId}`);
      failCount++;
      continue;
    }

    const typeLabel = item.type === "ad" ? "광고" : "일상";
    process.stdout.write(
      `[${item.time}] ${item.cafe} ${item.accountId} ${typeLabel} "${item.keyword}" ... `,
    );

    try {
      const prompt =
        item.type === "ad"
          ? buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" })
          : buildShortDailyPrompt({
              keyword: item.keyword,
              keywordType: "own",
            });

      const { content } = await generateViralContent({
        prompt,
        model: "gemini-3.1-pro-preview",
      });
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);
      if (!title || !body) throw new Error(`파싱 실패`);

      const viralComments: ViralCommentsData | undefined = parsed?.comments
        ?.length
        ? { comments: parsed.comments }
        : undefined;

      const jobData: PostJobData = {
        type: "post",
        accountId: item.accountId,
        userId: user.userId,
        cafeId: item.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: body,
        rawContent: content,
        keyword: item.keyword,
        category: item.category,
        commenterAccountIds: commenterIds,
        viralComments,
      };

      await addTaskJob(item.accountId, jobData, delayMs);
      totalPosts++;
      console.log(
        `✅ [${title.slice(0, 25)}...] (${Math.round(delayMs / 60000)}분 후)`,
      );
    } catch (e) {
      failCount++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n=== 완료 ===");
  console.log(`글 작성: ${totalPosts}건 / 실패: ${failCount}건`);
  console.log(
    `사이드 댓글: ${totalSideComments}건 / 좋아요: ${totalSideLikes}건`,
  );
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("run-schedule failed:", e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
