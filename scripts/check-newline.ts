import { getRedisConnection } from '@/shared/lib/redis';

const main = async () => {
  const redis = getRedisConnection();
  const allCompletedKeys = await redis.keys('bull:task_*:completed');
  const results: Array<{
    seqIdx: number | undefined;
    type: string;
    accountId: string;
    ci: number;
    hasNewline: boolean;
    contentFull: string;
  }> = [];

  for (const compKey of allCompletedKeys) {
    const queueBase = compKey.replace(':completed', '');
    const completedIds = await redis.zrange(compKey, 0, -1);

    for (const jobId of completedIds) {
      const jobData = await redis.hget(queueBase + ':' + jobId, 'data');
      if (jobData && jobData.includes('50세 임신')) {
        const parsed = JSON.parse(jobData);
        if (parsed.type === 'comment' || parsed.type === 'reply') {
          const hasNewline = (parsed.content || '').includes('\n');
          results.push({
            seqIdx: parsed.sequenceIndex,
            type: parsed.type,
            accountId: parsed.accountId,
            ci: parsed.commentIndex,
            hasNewline,
            contentFull: parsed.content,
          });
        }
      }
    }
  }

  const seqResults = results
    .filter((r) => r.seqIdx !== undefined)
    .sort((a, b) => (a.seqIdx ?? 0) - (b.seqIdx ?? 0));

  for (const r of seqResults) {
    const nl = r.hasNewline ? '🔴 \\n있음' : '✅ 없음';
    console.log(
      `[seq${r.seqIdx}] ${r.type.padEnd(7)} | ${r.accountId.padEnd(14)} | ci:${r.ci} | ${nl}`
    );
    if (r.hasNewline) {
      console.log(`  content: ${JSON.stringify(r.contentFull)}`);
    }
  }

  await redis.quit();
};

main();
