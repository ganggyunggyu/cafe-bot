import Redis from "ioredis";

const redis = new Redis("redis://localhost:6379/1", { maxRetriesPerRequest: null });

const main = async () => {
  const idKeys = await redis.keys("bull:task_*:id");
  const queueNames = idKeys.map((k) => k.replace(":id", "").replace("bull:", ""));

  const allCompleted: any[] = [];
  for (const qn of queueNames) {
    const prefix = `bull:${qn}`;
    const keyType = await redis.type(`${prefix}:completed`);
    let ids: string[] = [];
    if (keyType === "list") {
      ids = await redis.lrange(`${prefix}:completed`, 0, -1);
    } else if (keyType === "set") {
      ids = await redis.smembers(`${prefix}:completed`);
    } else if (keyType === "zset") {
      ids = await redis.zrange(`${prefix}:completed`, 0, -1);
    } else {
      continue;
    }
    for (const jid of ids) {
      const raw = await redis.hgetall(`${prefix}:${jid}`);
      if (raw == null || raw.data == null) continue;
      const d = JSON.parse(raw.data);
      allCompleted.push({
        qn, jid, type: d.type, account: d.accountId,
        keyword: d.keyword || "", articleId: d.articleId || "",
        cafeId: d.cafeId || "", content: (d.content || "").slice(0, 25),
        subject: (d.subject || "").slice(0, 35),
      });
    }
  }

  console.log(`=== 전체 completed: ${allCompleted.length}개 ===`);
  const typeCounts: Record<string, number> = {};
  for (const j of allCompleted) { typeCounts[j.type] = (typeCounts[j.type] || 0) + 1; }
  console.log("타입별:", JSON.stringify(typeCounts));

  // 완전 중복: type+account+articleId+content
  const seen = new Map<string, any>();
  const dupes: any[] = [];
  for (const j of allCompleted) {
    const key = `${j.type}|${j.account}|${j.articleId}|${j.content}`;
    if (seen.has(key)) { dupes.push(j); } else { seen.set(key, j); }
  }
  console.log(`\n완전 중복: ${dupes.length}개`);
  for (const d of dupes) {
    console.log(`  [중복] ${d.qn} | ${d.jid} | ${d.type} ${d.account} #${d.articleId} | ${d.content}`);
  }

  // POST 카페별
  const posts = allCompleted.filter((j) => j.type === "post");
  console.log(`\n=== POST (${posts.length}개) ===`);
  for (const p of posts) {
    const cafe = p.cafeId === "25729954" ? "쇼핑" : p.cafeId === "25460974" ? "샤넬" : p.cafeId;
    console.log(`  ${cafe} | ${p.account} | ${p.keyword} | ${p.subject}`);
  }

  // 중복 삭제
  if (dupes.length > 0) {
    for (const d of dupes) {
      const prefix = `bull:${d.qn}`;
      const dtype = await redis.type(`${prefix}:completed`);
      if (dtype === "list") await redis.lrem(`${prefix}:completed`, 1, d.jid);
      else if (dtype === "set") await redis.srem(`${prefix}:completed`, d.jid);
      else if (dtype === "zset") await redis.zrem(`${prefix}:completed`, d.jid);
      await redis.del(`${prefix}:${d.jid}`);
      await redis.del(`${prefix}:${d.jid}:logs`);
    }
    console.log(`\n${dupes.length}개 중복 삭제 완료`);
  }

  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
