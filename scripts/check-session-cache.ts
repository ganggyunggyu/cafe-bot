/**
 * Writer 5명의 Redis 세션 쿠키 캐시 상태 확인
 */
import Redis from 'ioredis';

const WRITER_IDS = ['olgdmp9921', 'yenalk', 'eytkgy5500', 'uqgidh2690', '4giccokx'];

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  for (const acc of WRITER_IDS) {
    const keys = await redis.keys(`*${acc}*`);
    console.log(`\n${acc}:`);
    for (const k of keys) {
      const type = await redis.type(k);
      if (type === 'string') {
        const v = await redis.get(k);
        const preview = v ? v.slice(0, 80) : '(empty)';
        console.log(`  ${k} [${type}] ${preview}`);
      } else if (type === 'hash') {
        const h = await redis.hgetall(k);
        console.log(`  ${k} [hash] keys=${Object.keys(h).join(',')}`);
      } else {
        console.log(`  ${k} [${type}]`);
      }
    }
  }

  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
