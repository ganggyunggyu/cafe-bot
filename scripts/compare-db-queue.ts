import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import mongoose from "mongoose";
import Redis from "ioredis";

const MONGODB_URI = process.env.MONGODB_URI;
const CAFE_NAMES: Record<string, string> = {
  "25729954": "쇼핑지름신",
  "25460974": "샤넬오픈런",
  "25227349": "minemh",
  "25636798": "맛집탐험대",
};

const main = async () => {
  await mongoose.connect(MONGODB_URI as string);
  const db = mongoose.connection.db;
  if (db == null) throw new Error("db null");

  const redis = new Redis("redis://localhost:6379/1", { maxRetriesPerRequest: null });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // === DB: 오늘 발행된 글 ===
  const articles = await db.collection("publishedarticles")
    .find({ createdAt: { $gte: today } })
    .toArray();

  console.log("=== DB 발행 완료 (publishedarticles) ===");
  console.log(`총 ${articles.length}건\n`);

  const dbByCafe: Record<string, any[]> = {};
  for (const a of articles) {
    const cafeId = a.cafeId?.toString() || "unknown";
    if (dbByCafe[cafeId] == null) dbByCafe[cafeId] = [];
    dbByCafe[cafeId].push(a);
  }

  const dbAdCount: Record<string, number> = {};
  for (const [cafeId, arts] of Object.entries(dbByCafe)) {
    const cafeName = CAFE_NAMES[cafeId] || cafeId;
    console.log(`[${cafeName}] ${arts.length}건`);
    const byAccount: Record<string, any[]> = {};
    for (const a of arts) {
      const acc = a.writerAccountId || "unknown";
      if (byAccount[acc] == null) byAccount[acc] = [];
      byAccount[acc].push(a);
    }
    for (const [acc, list] of Object.entries(byAccount)) {
      for (const a of list) {
        const kw = a.keyword || "-";
        const cat = a.category || "-";
        const isAd = cat !== "일상톡톡" && cat !== "자유게시판";
        if (isAd) dbAdCount[cafeName] = (dbAdCount[cafeName] || 0) + 1;
        console.log(`  ${acc} | ${kw} | ${cat} | #${a.articleId || "?"} ${isAd ? "광고" : "일상"}`);
      }
    }
    console.log("");
  }

  // === 큐: delayed/active/waiting 잡 ===
  console.log("=== 큐 대기 중 (delayed + active + waiting) ===");
  const idKeys = await redis.keys("bull:task_*:id");
  const queueNames = idKeys.map((k) => k.replace(":id", "").replace("bull:", ""));

  const pendingPosts: any[] = [];

  for (const qn of queueNames) {
    const prefix = `bull:${qn}`;

    // delayed
    const delayedIds = await redis.zrange(`${prefix}:delayed`, 0, -1, "WITHSCORES");
    for (let i = 0; i < delayedIds.length; i += 2) {
      const jid = delayedIds[i];
      const score = delayedIds[i + 1];
      const raw = await redis.hget(`${prefix}:${jid}`, "data");
      if (raw == null) continue;
      const d = JSON.parse(raw);
      if (d.type === "post") {
        pendingPosts.push({ ...d, status: "delayed", runAt: new Date(Number(score)) });
      }
    }

    // active
    const activeIds = await redis.lrange(`${prefix}:active`, 0, -1);
    for (const jid of activeIds) {
      const raw = await redis.hget(`${prefix}:${jid}`, "data");
      if (raw == null) continue;
      const d = JSON.parse(raw);
      if (d.type === "post") {
        pendingPosts.push({ ...d, status: "active" });
      }
    }

    // waiting
    const waitIds = await redis.lrange(`${prefix}:wait`, 0, -1);
    for (const jid of waitIds) {
      const raw = await redis.hget(`${prefix}:${jid}`, "data");
      if (raw == null) continue;
      const d = JSON.parse(raw);
      if (d.type === "post") {
        pendingPosts.push({ ...d, status: "waiting" });
      }
    }
  }

  console.log(`POST 잡 ${pendingPosts.length}건\n`);
  const queueAdCount: Record<string, number> = {};
  for (const p of pendingPosts) {
    const cafeName = CAFE_NAMES[p.cafeId] || p.cafeId;
    const runStr = p.runAt ? p.runAt.toLocaleTimeString("ko-KR") : "-";
    console.log(`  [${p.status}] ${cafeName} | ${p.accountId} | ${p.keyword} | ${runStr}`);
    queueAdCount[cafeName] = (queueAdCount[cafeName] || 0) + 1;
  }

  // === 합산 ===
  console.log("\n=== 합산 (DB + 큐) ===");
  const allCafes = new Set([...Object.keys(dbAdCount), ...Object.keys(queueAdCount)]);
  for (const cafe of allCafes) {
    const dbN = dbAdCount[cafe] || 0;
    const qN = queueAdCount[cafe] || 0;
    console.log(`${cafe}: DB ${dbN}건 + 큐 ${qN}건 = 총 ${dbN + qN}건`);
  }

  await mongoose.disconnect();
  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
