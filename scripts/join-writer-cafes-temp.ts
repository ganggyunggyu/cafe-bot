import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from "../src/shared/lib/multi-session";
import type { Page } from "playwright";

type WriterAccount = {
  accountId: string;
  password: string;
  nickname?: string;
};

type TargetCafe = {
  cafeId: string;
  cafeUrl: string;
  name: string;
};

type JoinStatus =
  | "joined"
  | "already-member"
  | "pending-approval"
  | "login-failed"
  | "join-button-not-found"
  | "verify-failed"
  | "failed";

type JoinResult = {
  accountId: string;
  nickname?: string;
  cafeName: string;
  cafeId: string;
  status: JoinStatus;
  detail?: string;
};

const TARGET_CAFES: TargetCafe[] = [
  { name: "쇼핑지름신", cafeId: "25729954", cafeUrl: "shopjirmsin" },
  { name: "샤넬오픈런", cafeId: "25460974", cafeUrl: "shoppingtpw" },
];

const JOIN_ANSWERS = [
  "네 숙지했습니다",
  "네 알겠습니다",
  "카페 규칙 지키며 활동하겠습니다",
  "좋은 정보 함께 나누겠습니다",
];

const wait = async (page: Page, ms: number) => {
  await page.waitForTimeout(ms);
};

const getVisibleText = async (page: Page): Promise<string> =>
  page.evaluate<string>("document.body ? document.body.innerText : ''");

const navigateToCafe = async (page: Page, cafe: TargetCafe) => {
  const urls = [
    `https://m.cafe.naver.com/${cafe.cafeUrl}`,
    `https://m.cafe.naver.com/ca-fe/web/cafes/${cafe.cafeId}`,
    `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}`,
  ];

  for (const url of urls) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    await wait(page, 2500);
    const text = await getVisibleText(page).catch(() => "");
    if (text.trim().length > 0 || !page.url().includes("nidlogin")) {
      return;
    }
  }
};

const detectMemberState = async (page: Page): Promise<JoinStatus | null> => {
  const state = await page.evaluate<string | null>(`(() => {
    const text = document.body?.innerText || "";
    const normalized = text.replace(/\s+/g, " ");
    const memberKey = String(window.g_sUserMemberKey || "").trim();

    if (memberKey) return "already-member";
    if (/가입\s*승인|승인\s*대기|가입신청|가입 신청|가입\s*대기/.test(normalized)) {
      return "pending-approval";
    }
    if (/글쓰기|카페글쓰기|나의활동|나의 활동|내\s*정보/.test(normalized)) {
      return "already-member";
    }
    if (/카페\s*가입하기|가입하기/.test(normalized)) return null;
    return null;
  })()`);

  return state as JoinStatus | null;
};

const clickJoinButton = async (page: Page): Promise<boolean> => {
  const selectors = [
    'a:has-text("카페 가입하기")',
    'button:has-text("카페 가입하기")',
    'a:has-text("가입하기")',
    'button:has-text("가입하기")',
    'a[href*="Join"]',
    'a[href*="join"]',
    'button[class*="join"]',
    'a[class*="join"]',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 5000 }).catch(() => undefined);
      await wait(page, 2500);
      return true;
    }
  }

  return page.evaluate<boolean>(`(() => {
    const elements = Array.from(document.querySelectorAll("a, button"));
    const target = elements.find((element) => {
      const text = element.innerText || element.textContent || "";
      return /카페\s*가입하기|가입하기/.test(text);
    });

    target?.click();
    return Boolean(target);
  })()`);
};

const fillJoinForm = async (page: Page, account: WriterAccount) => {
  const nickname = account.nickname || account.accountId;
  const payload = JSON.stringify({ nickname, answers: JOIN_ANSWERS });

  await page.evaluate<void>(`(({ nickname: value, answers }) => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const dispatch = (element, valueToSet) => {
        element.focus();
        element.value = valueToSet;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.blur();
      };

      const inputs = Array.from(document.querySelectorAll("input"));
      const nickInput = inputs.find((input) => {
        const label = [
          input.name,
          input.id,
          input.placeholder,
          input.getAttribute("title"),
          input.getAttribute("aria-label"),
        ]
          .filter(Boolean)
          .join(" ");
        return isVisible(input) && /nick|별명|닉네임/i.test(label);
      });

      if (nickInput) {
        dispatch(nickInput, value);
      }

      const textFields = [
        ...Array.from(document.querySelectorAll("textarea")),
        ...inputs.filter((input) => {
          const type = (input.getAttribute("type") || "text").toLowerCase();
          if (!["text", "search", ""].includes(type)) return false;
          if (input === nickInput) return false;
          const label = [
            input.name,
            input.id,
            input.placeholder,
            input.getAttribute("title"),
            input.getAttribute("aria-label"),
          ]
            .filter(Boolean)
            .join(" ");
          return !/nick|별명|닉네임|id|pw|password|검색/i.test(label);
        }),
      ].filter((element) => isVisible(element));

      textFields.forEach((field, index) => {
        dispatch(field, answers[index] || answers[answers.length - 1]);
      });

      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      checkboxes
        .filter((checkbox) => isVisible(checkbox) && !checkbox.checked && !checkbox.disabled)
        .forEach((checkbox) => {
          checkbox.click();
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        });
    })(${payload})`);

  await wait(page, 1000);
};

const clickSubmitButton = async (page: Page): Promise<boolean> => {
  const selectors = [
    'button:has-text("동의 후 가입하기")',
    'a:has-text("동의 후 가입하기")',
    'button:has-text("가입하기")',
    'a:has-text("가입하기")',
    'input[type="submit"]',
    'button[type="submit"]',
    'button:has-text("확인")',
    'a:has-text("확인")',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 5000 }).catch(() => undefined);
      await wait(page, 4000);
      return true;
    }
  }

  return page.evaluate<boolean>(`(() => {
    const elements = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
    const target = elements.find((element) => {
      const text =
        element instanceof HTMLInputElement
          ? element.value
          : element.innerText || element.textContent || "";
      return /동의 후 가입하기|가입하기|확인/.test(text) && !/취소|닫기/.test(text);
    });

    target?.click();
    return Boolean(target);
  })()`);
};

const verifyCafeState = async (page: Page, cafe: TargetCafe): Promise<JoinStatus> => {
  await navigateToCafe(page, cafe);
  await wait(page, 2500);

  const state = await detectMemberState(page);
  if (state) return state;

  const text = await getVisibleText(page);
  if (/카페\s*가입하기|가입하기/.test(text)) return "verify-failed";
  if (/가입\s*승인|승인\s*대기|가입신청|가입 신청/.test(text)) return "pending-approval";

  return "already-member";
};

const joinCafe = async (page: Page, account: WriterAccount, cafe: TargetCafe): Promise<JoinResult> => {
  await page.setViewportSize({ width: 390, height: 844 }).catch(() => undefined);
  page.on("dialog", async (dialog) => {
    console.log(`[JOIN] dialog: ${dialog.message()}`);
    await dialog.accept().catch(() => undefined);
  });

  await navigateToCafe(page, cafe);

  if (page.url().includes("nidlogin")) {
    return {
      accountId: account.accountId,
      nickname: account.nickname,
      cafeName: cafe.name,
      cafeId: cafe.cafeId,
      status: "login-failed",
      detail: "카페 이동 중 로그인 페이지로 이동됨",
    };
  }

  const beforeState = await detectMemberState(page);
  if (beforeState === "already-member" || beforeState === "pending-approval") {
    return {
      accountId: account.accountId,
      nickname: account.nickname,
      cafeName: cafe.name,
      cafeId: cafe.cafeId,
      status: beforeState,
    };
  }

  const clickedJoin = await clickJoinButton(page);
  if (!clickedJoin) {
    return {
      accountId: account.accountId,
      nickname: account.nickname,
      cafeName: cafe.name,
      cafeId: cafe.cafeId,
      status: "join-button-not-found",
      detail: (await getVisibleText(page)).slice(0, 220),
    };
  }

  await fillJoinForm(page, account);
  const submitted = await clickSubmitButton(page);
  if (!submitted) {
    return {
      accountId: account.accountId,
      nickname: account.nickname,
      cafeName: cafe.name,
      cafeId: cafe.cafeId,
      status: "failed",
      detail: "가입 제출 버튼을 찾지 못함",
    };
  }

  const afterText = await getVisibleText(page).catch(() => "");
  if (/이미\s*사용|사용\s*중인|사용할 수 없는/.test(afterText) && /별명|닉네임/.test(afterText)) {
    await fillJoinForm(page, {
      ...account,
      nickname: `${account.nickname || account.accountId}${account.accountId.slice(-2)}`,
    });
    await clickSubmitButton(page);
  }

  const verifiedState = await verifyCafeState(page, cafe);

  return {
    accountId: account.accountId,
    nickname: account.nickname,
    cafeName: cafe.name,
    cafeId: cafe.cafeId,
    status: verifiedState === "already-member" ? "joined" : verifiedState,
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI || "", {
    serverSelectionTimeoutMS: 10000,
  });

  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) {
    throw new Error("21lab user not found");
  }

  const accounts = await Account.find({
    userId: (user as { userId: string }).userId,
    isActive: true,
    role: "writer",
  })
    .sort({ isMain: -1, createdAt: 1 })
    .select("accountId password nickname")
    .lean<WriterAccount[]>();

  if (accounts.length === 0) {
    throw new Error("활성 writer 계정 없음");
  }

  const results: JoinResult[] = [];
  console.log(`[JOIN] 대상 writer ${accounts.length}개, 카페 ${TARGET_CAFES.length}개`);

  for (const account of accounts) {
    await acquireAccountLock(account.accountId);

    try {
      console.log(`\n[JOIN] ${account.accountId} (${account.nickname || "-"}) 로그인 확인`);
      const loggedIn = await isAccountLoggedIn(account.accountId);
      if (!loggedIn) {
        const loginResult = await loginAccount(account.accountId, account.password, {
          waitForLoginMs: 10 * 60 * 1000,
          reason: "join_writer_cafes",
        });

        if (!loginResult.success) {
          for (const cafe of TARGET_CAFES) {
            results.push({
              accountId: account.accountId,
              nickname: account.nickname,
              cafeName: cafe.name,
              cafeId: cafe.cafeId,
              status: "login-failed",
              detail: loginResult.error,
            });
          }
          continue;
        }
      }

      const page = await getPageForAccount(account.accountId);

      for (const cafe of TARGET_CAFES) {
        console.log(`[JOIN] ${account.accountId} → ${cafe.name} 진행`);
        const result = await joinCafe(page, account, cafe);
        results.push(result);
        console.log(`[JOIN] ${account.accountId} → ${cafe.name}: ${result.status}${result.detail ? ` (${result.detail.slice(0, 80)})` : ""}`);
        await saveCookiesForAccount(account.accountId);
        await wait(page, 3000);
      }
    } finally {
      releaseAccountLock(account.accountId);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const summary = results.reduce(
    (acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log("\n[JOIN] 결과 요약");
  console.log(JSON.stringify({ summary, results }, null, 2));

  await closeAllContexts();
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("[JOIN] 실패:", error instanceof Error ? error.message : error);
  await closeAllContexts().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
