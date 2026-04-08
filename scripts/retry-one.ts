import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models";
import { modifyArticleWithAccount } from "../src/features/auto-comment/batch/article-modifier";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = "25460974";
const ARTICLE_ID = 290137;
const KEYWORD = "빈혈에좋은음식";

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) throw new Error("user not found");
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();

  const article = await PublishedArticle.findOne({ cafeId: CAFE_ID, articleId: ARTICLE_ID }).lean();
  if (!article) throw new Error("article not found");

  const writerAccount = accounts.find((a) => a.accountId === article.writerAccountId);
  if (!writerAccount) throw new Error("writer not found");

  console.log(`재시도: [${ARTICLE_ID}] "${KEYWORD}" (작성자: ${writerAccount.accountId})`);

  // 원고 생성
  const prompt = buildOwnKeywordPrompt({ keyword: KEYWORD, keywordType: "own" });
  process.stdout.write("원고 생성 중... ");
  const { content } = await generateViralContent({ prompt });
  const parsed = parseViralResponse(content);
  const title = parsed?.title || "";
  const body = parsed?.body || "";
  if (!title || !body) throw new Error("파싱 실패");
  console.log(`✅ "${title.slice(0, 30)}..."`);

  // 수정 (타임아웃 늘림)
  const naverAccount: NaverAccount = {
    id: writerAccount.accountId,
    password: writerAccount.password,
    nickname: writerAccount.nickname,
  };

  process.stdout.write("글 수정 중... ");
  const result = await modifyArticleWithAccount(naverAccount, {
    cafeId: CAFE_ID,
    articleId: ARTICLE_ID,
    newTitle: title,
    newContent: body,
    enableComments: true,
  });

  if (!result.success) {
    console.log(`❌ ${result.error}`);
    return;
  }

  console.log("✅ 수정 완료");

  await PublishedArticle.updateOne(
    { cafeId: CAFE_ID, articleId: ARTICLE_ID },
    { $set: { status: "modified", title, content: body, keyword: KEYWORD } },
  );
  console.log("DB 업데이트 완료");
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error("retry failed:", e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
