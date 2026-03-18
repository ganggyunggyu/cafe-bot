import Redis from "ioredis";
const redis = new Redis("redis://localhost:6379/1", { maxRetriesPerRequest: null });

const main = async () => {
  const idKeys = await redis.keys("bull:task_*:id");
  const queueNames = idKeys.map((k) => k.replace(":id", "").replace("bull:", ""));

  for (const qn of queueNames) {
    const prefix = `bull:${qn}`;
    const activeIds = await redis.lrange(`${prefix}:active`, 0, -1);
    const delayedIds = await redis.zrange(`${prefix}:delayed`, 0, -1);
    const waitIds = await redis.lrange(`${prefix}:wait`, 0, -1);
    if (activeIds.length === 0 && delayedIds.length === 0 && waitIds.length === 0) continue;

    console.log(`\n[${qn}] active:${activeIds.length} delayed:${delayedIds.length} waiting:${waitIds.length}`);

    for (const jid of activeIds) {
      const raw = await redis.hget(`${prefix}:${jid}`, "data");
      if (raw == null) continue;
      const d = JSON.parse(raw);
      console.log(`  ACTIVE ${d.type} | ${d.accountId} | ${d.keyword || d.content?.slice(0, 30) || "#" + d.articleId || ""}`);
    }
    for (const jid of delayedIds) {
      const raw = await redis.hget(`${prefix}:${jid}`, "data");
      if (raw == null) continue;
      const d = JSON.parse(raw);
      const score = await redis.zscore(`${prefix}:delayed`, jid);
      const runAt = score ? new Date(Number(score)).toLocaleTimeString("ko-KR") : "";
      console.log(`  DELAYED ${d.type} | ${d.accountId} | ${d.keyword || d.content?.slice(0, 30) || "#" + d.articleId || ""} @ ${runAt}`);
    }
  }
  await redis.quit();
};
main();
