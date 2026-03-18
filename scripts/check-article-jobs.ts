import Redis from 'ioredis';
const redis = new Redis('redis://localhost:6379/1', { maxRetriesPerRequest: null });

const main = async () => {
  const targetArticleId = Number(process.argv[2]) || 11130276;
  const targetCafeId = process.argv[3] || '25729954';
  const targetKeyword = process.argv[4] || '난임 한약 비용';

  const idKeys = await redis.keys('bull:task_*:id');
  const queueNames = idKeys.map(k => k.replace(':id', '').replace('bull:', ''));

  let found = 0;
  for (const qn of queueNames) {
    const prefix = `bull:${qn}`;

    const failedIds = await redis.zrange(`${prefix}:failed`, 0, -1);
    const activeIds = await redis.lrange(`${prefix}:active`, 0, -1);
    const delayedIds = await redis.zrange(`${prefix}:delayed`, 0, -1);
    const waitIds = await redis.lrange(`${prefix}:wait`, 0, -1);
    const completedIds = await redis.zrange(`${prefix}:completed`, 0, -1);

    const allIds = [
      ...failedIds.map(id => ({ id, state: 'FAILED' })),
      ...activeIds.map(id => ({ id, state: 'ACTIVE' })),
      ...delayedIds.map(id => ({ id, state: 'DELAYED' })),
      ...waitIds.map(id => ({ id, state: 'WAIT' })),
      ...completedIds.map(id => ({ id, state: 'COMPLETED' })),
    ];

    for (const { id: jid, state } of allIds) {
      const raw = await redis.hget(`${prefix}:${jid}`, 'data');
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d.cafeId === targetCafeId && (d.articleId === targetArticleId || d.keyword === targetKeyword)) {
        const failRaw = state === 'FAILED' ? await redis.hget(`${prefix}:${jid}`, 'failedReason') : null;
        const score = state === 'DELAYED' ? await redis.zscore(`${prefix}:delayed`, jid) : null;
        const runAt = score ? new Date(Number(score)).toLocaleTimeString('ko-KR') : '';
        console.log(`[${state}] ${qn} | ${d.type} | ${d.accountId} | seqIdx:${d.sequenceIndex ?? 'N/A'} | commentIdx:${d.commentIndex ?? 'N/A'}${runAt ? ' @ ' + runAt : ''}${failRaw ? ' | reason: ' + failRaw : ''}`);
        found++;
      }
    }
  }

  if (found === 0) console.log('관련 잡 없음');
  else console.log(`\n총 ${found}건`);

  await redis.quit();
};
main();
