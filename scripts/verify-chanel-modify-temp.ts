import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models/published-article";
import {
  acquireAccountLock,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from "../src/shared/lib/multi-session";

const LOGIN_ID = "21lab";
const CAFE_ID = "25460974";
const ARTICLE_IDS = [
  292072,
  292062,
  292049,
  292032,
  291858,
  291832,
  291807,
  291773,
  291742,
  291527,
  291466,
  291449,
  291373,
  291321,
  291168,
  291018,
  289754,
  289677,
  288077,
];

type ArticleSummary = {
  articleId: number;
  expectedTitle: string;
  articleUrl: string;
};

const main = async (): Promise<void> => {
  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
  });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const checker = accounts.find((account) => account.accountId === "8i2vlbym");
  if (!checker) throw new Error("checker account not found");

  const articles = await PublishedArticle.find({
    cafeId: CAFE_ID,
    articleId: { $in: ARTICLE_IDS },
  })
    .select({ _id: 0, articleId: 1, title: 1, articleUrl: 1 })
    .lean();

  const articleMap = new Map<number, ArticleSummary>(
    articles.map((article) => [
      article.articleId,
      {
        articleId: article.articleId,
        expectedTitle: article.title,
        articleUrl: article.articleUrl,
      },
    ]),
  );

  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(checker.accountId, checker.password);
      if (!loginResult.success) {
        throw new Error(`login failed: ${loginResult.error}`);
      }
    }

    const page = await getPageForAccount(checker.accountId);

    for (const articleId of ARTICLE_IDS) {
      const article = articleMap.get(articleId);
      if (!article) {
        console.log(`MISS\t#${articleId}\tDB 없음`);
        continue;
      }

      await page.goto(article.articleUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      let root = page.mainFrame();
      const frameHandle = await page.$("iframe#cafe_main");
      if (frameHandle) {
        const frame = await frameHandle.contentFrame();
        if (frame) {
          root = frame;
        }
      }

      await root.waitForLoadState("domcontentloaded").catch(() => {});
      await root.waitForSelector(".title_text, h3.title_text, .CommentItem, .comment_text_view", {
        timeout: 10000,
      }).catch(() => {});

      const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${CAFE_ID}/articles/${articleId}?useCafeId=true`;
      const apiResult = await page.evaluate(async (url: string) => {
        try {
          const response = await fetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            return { ok: false, status: response.status };
          }

          const data = await response.json();
          const target = data?.result?.article;
          return {
            ok: true,
            status: response.status,
            title: target?.subject || "",
            isWriteComment: target?.isWriteComment,
            commentCount: target?.commentCount ?? 0,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }, apiUrl);

      const uiResult = await root.evaluate(() => {
        const title =
          document.querySelector("h3.title_text")?.textContent?.trim() ||
          document.querySelector(".title_text")?.textContent?.trim() ||
          "";

        const comments = Array.from(
          document.querySelectorAll(".CommentItem:not(.CommentItem--reply) .comment_text_view"),
        )
          .map((node) => node.textContent?.trim() || "")
          .filter(Boolean);

        const replies = Array.from(
          document.querySelectorAll(".CommentItem.CommentItem--reply .comment_text_view"),
        )
          .map((node) => node.textContent?.trim() || "")
          .filter(Boolean);

        return {
          title,
          visibleComments: comments.length,
          visibleReplies: replies.length,
          previews: [...comments.slice(0, 2), ...replies.slice(0, 1)].map((text) =>
            text.replace(/\s+/g, " ").slice(0, 45),
          ),
        };
      });

      const titleMatches =
        uiResult.title === article.expectedTitle || apiResult.title === article.expectedTitle;
      const commentOk = (apiResult.commentCount ?? 0) > 0 || uiResult.visibleComments > 0;

      console.log(
        [
          titleMatches ? "OK" : "MISMATCH",
          `#${articleId}`,
          `apiComment=${apiResult.commentCount ?? 0}`,
          `uiComment=${uiResult.visibleComments}`,
          `uiReply=${uiResult.visibleReplies}`,
          `write=${String(apiResult.isWriteComment)}`,
          `title=${uiResult.title || apiResult.title || "-"}`,
          `preview=${uiResult.previews.join(" | ") || "-"}`,
          `commentOk=${String(commentOk)}`,
        ].join("\t"),
      );
    }

    await saveCookiesForAccount(checker.accountId);
  } finally {
    releaseAccountLock(checker.accountId);
    await mongoose.disconnect();
  }
};

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
