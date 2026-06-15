import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { existsSync, readFileSync, writeFileSync } from "fs";
import { Queue } from "bullmq";
import mongoose from "mongoose";
import Redis from "ioredis";
import { PublishedArticle } from "../src/shared/models/published-article";

const TARGET_DATE = process.env.TARGET_DATE || getKstDate(new Date());
const LEDGER_PATH =
  process.env.LEDGER_PATH ||
  `scripts/artifacts/cafe-publish-ledger-${TARGET_DATE}.json`;
const CSV_PATH = LEDGER_PATH.replace(/\.json$/, ".csv");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/1";
const TOKEN = process.env.SCHEDULE_RESCHEDULE_TOKEN || "";

type LedgerRow = {
  recordedAtKst: string;
  scheduledAtKst: string;
  publishedAtKst: string;
  cafeName: string;
  cafeId: string;
  postType: string;
  keyword: string;
  accountId: string;
  subject: string;
  category: string;
  menuId: string;
  rescheduleToken: string;
  jobId: string;
  queueState: string;
  status: string;
  articleId: string | number;
  articleUrl: string;
  failedReason: string;
};

type OutputRow = {
  ledgerIndex: number;
  statusKo: string;
  valuesJP: string[];
  rowKey: {
    date: string;
    time: string;
    cafeName: string;
    postType: string;
    keyword: string;
    accountId: string;
  };
};

const CSV_HEADERS: (keyof LedgerRow)[] = [
  "recordedAtKst",
  "scheduledAtKst",
  "publishedAtKst",
  "cafeName",
  "cafeId",
  "postType",
  "keyword",
  "accountId",
  "subject",
  "category",
  "menuId",
  "rescheduleToken",
  "jobId",
  "queueState",
  "status",
  "articleId",
  "articleUrl",
  "failedReason",
];

function getKstDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatKst(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function parseKst(value: string): Date {
  return new Date(`${value.replace(" ", "T")}+09:00`);
}

function toSheetTime(value: string): string {
  return value.slice(11, 16);
}

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function csvEscape(value: unknown): string {
  const text = normalize(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(rows: LedgerRow[]): void {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")),
  ];
  writeFileSync(CSV_PATH, `${lines.join("\n")}\n`);
}

function queueNameForAccount(accountId: string): string {
  return `task_${accountId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function note(token: string, reason?: string): string {
  return reason ? `token=${token} / ${reason}` : `token=${token}`;
}

async function main(): Promise<void> {
  if (!existsSync(LEDGER_PATH)) {
    throw new Error(`ledger not found: ${LEDGER_PATH}`);
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI missing");
  }

  const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as {
    generatedAt: string;
    date: string;
    token?: string;
    rows: LedgerRow[];
  };
  const rows = ledger.rows.filter((row) => !TOKEN || row.rescheduleToken === TOKEN);
  const token = TOKEN || ledger.token || rows[0]?.rescheduleToken || "";
  const now = new Date();

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const start = parseKst(`${TARGET_DATE} 00:00:00`);
  const end = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000);
  const articles = await PublishedArticle.find(
    {
      publishedAt: { $gte: start, $lt: end },
    },
    {
      _id: 0,
      articleId: 1,
      cafeId: 1,
      keyword: 1,
      title: 1,
      articleUrl: 1,
      writerAccountId: 1,
      publishedAt: 1,
      postType: 1,
    },
  )
    .sort({ publishedAt: 1 })
    .lean();

  const queues = new Map<string, Queue>();
  const getQueue = (accountId: string): Queue => {
    const queueName = queueNameForAccount(accountId);
    const existing = queues.get(queueName);
    if (existing) return existing;
    const queue = new Queue(queueName, {
      connection: { host: "localhost", port: 6379, db: 1 },
    });
    queues.set(queueName, queue);
    return queue;
  };

  const outputs: OutputRow[] = [];

  for (const [ledgerIndex, row] of ledger.rows.entries()) {
    if (!rows.includes(row)) continue;

    const queue = getQueue(row.accountId);
    const job = await queue.getJob(row.jobId);
    const state = job ? await job.getState() : "not_found";
    const returnValue = (job?.returnvalue || {}) as {
      success?: boolean;
      articleId?: number;
      articleUrl?: string;
      error?: string;
    };

    const exactArticle = articles.find((article) => {
      if (returnValue.articleId && Number(article.articleId) === Number(returnValue.articleId)) {
        return true;
      }
      return (
        normalize(article.cafeId) === normalize(row.cafeId) &&
        normalize(article.writerAccountId) === normalize(row.accountId) &&
        normalize(article.keyword) === normalize(row.keyword) &&
        normalize(article.title) === normalize(row.subject)
      );
    });

    const scheduledAt = parseKst(row.scheduledAtKst);
    const finishedAt = job?.finishedOn ? formatKst(new Date(job.finishedOn)) : "";

    let statusKo = "예정";
    let status = "scheduled";
    let publishedAtKst = "";
    let articleId = "";
    let articleUrl = "";
    let actualTitle = "";
    let basis = state === "delayed" ? "Redis delayed 큐 확인" : "Redis 큐/원장 확인";
    let failedReason = "";

    if (exactArticle) {
      statusKo = "발행완료";
      status = "published";
      publishedAtKst = formatKst(new Date(exactArticle.publishedAt));
      articleId = String(exactArticle.articleId);
      articleUrl = normalize(exactArticle.articleUrl);
      actualTitle = normalize(exactArticle.title);
      basis = job ? "MongoDB PublishedArticle + Redis completed 확인" : "MongoDB PublishedArticle 확인";
    } else if (state === "failed") {
      statusKo = "실패";
      status = "failed";
      publishedAtKst = finishedAt;
      actualTitle = row.subject;
      failedReason = normalize(job?.failedReason || returnValue.error || row.failedReason || "발행 실패");
      basis = "Redis failed job 확인";
    } else if (state === "completed" && returnValue.success === false) {
      statusKo = "실패";
      status = "failed";
      publishedAtKst = finishedAt;
      actualTitle = row.subject;
      failedReason = normalize(returnValue.error || "completed job returned success=false");
      basis = "Redis completed returnValue 실패 확인";
    } else if (state === "active") {
      statusKo = "진행중";
      status = "active";
      actualTitle = row.subject;
      basis = "Redis active 큐 확인";
    } else if (state === "waiting" || state === "delayed") {
      statusKo = "예정";
      status = "scheduled";
      actualTitle = "";
      basis = `Redis ${state} 큐 확인`;
    } else if (scheduledAt.getTime() <= now.getTime()) {
      statusKo = "확인필요";
      status = "unknown";
      actualTitle = row.subject;
      failedReason = "예정 시각 경과, Redis job/DB 발행글 미확인";
      basis = "Redis job 미확인 + MongoDB PublishedArticle 미확인";
    }

    row.queueState = state;
    row.status = status;
    row.publishedAtKst = publishedAtKst;
    row.articleId = articleId;
    row.articleUrl = articleUrl;
    row.failedReason = failedReason;

    outputs.push({
      ledgerIndex,
      statusKo,
      valuesJP: [
        publishedAtKst,
        statusKo,
        articleId,
        actualTitle,
        articleUrl,
        basis,
        note(token, failedReason),
      ],
      rowKey: {
        date: row.scheduledAtKst.slice(0, 10),
        time: toSheetTime(row.scheduledAtKst),
        cafeName: row.cafeName,
        postType: row.postType,
        keyword: row.keyword,
        accountId: row.accountId,
      },
    });
  }

  ledger.generatedAt = new Date().toISOString();
  writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  writeCsv(ledger.rows);

  const summary = {
    targetDate: TARGET_DATE,
    token,
    generatedAtKst: formatKst(now),
    total: outputs.length,
    byStatus: outputs.reduce<Record<string, number>>((acc, row) => {
      acc[row.statusKo] = (acc[row.statusKo] || 0) + 1;
      return acc;
    }, {}),
    byCafe: rows.reduce<Record<string, Record<string, number>>>((acc, row, index) => {
      const statusKo = outputs[index]?.statusKo || "예정";
      acc[row.cafeName] ||= {};
      acc[row.cafeName][statusKo] = (acc[row.cafeName][statusKo] || 0) + 1;
      return acc;
    }, {}),
    byType: rows.reduce<Record<string, Record<string, number>>>((acc, row, index) => {
      const statusKo = outputs[index]?.statusKo || "예정";
      acc[row.postType] ||= {};
      acc[row.postType][statusKo] = (acc[row.postType][statusKo] || 0) + 1;
      return acc;
    }, {}),
    outputs,
  };

  console.log(JSON.stringify(summary, null, 2));

  for (const queue of queues.values()) {
    await queue.close();
  }
  await redis.quit();
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
