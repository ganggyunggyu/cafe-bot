import Redis from 'ioredis';

const WRITERS = ['compare14310', 'fail5644', 'loand3324', 'dyulp', 'gmezz'];

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  let ok = 0;
  let ng = 0;

  for (const w of WRITERS) {
    const prefix = `bull:task_${w}`;
    const ids = await redis.zrange(`${prefix}:delayed`, 0, -1);
    for (const id of ids) {
      const raw = await redis.hget(`${prefix}:${id}`, 'data');
      if (!raw) continue;
      const d = JSON.parse(raw);
      if (d.type !== 'post') continue;
      const has = d.viralComments?.comments?.length > 0;
      const label = has ? '✅' : '❌';
      if (has) ok++;
      else ng++;
      console.log(`${label} [${w}] "${(d.keyword || '').slice(0, 25)}" 댓글${has ? d.viralComments.comments.length + '개' : ' 없음'}`);
    }
  }

  console.log(`\n=== 결과: viralComments 있음 ${ok}건 / 없음 ${ng}건 ===`);
  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
