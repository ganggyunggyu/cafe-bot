import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';

async function main() {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  console.log('\n=== Redis 큐 데이터 정리 ===\n');

  // 모든 bull 키 조회
  const allKeys = await redis.keys('bull:*');
  console.log(`총 ${allKeys.length}개 키 발견\n`);

  if (allKeys.length === 0) {
    console.log('정리할 데이터 없음');
    await redis.quit();
    process.exit(0);
  }

  // 큐 이름별로 그룹핑해서 표시
  const queueCounts = new Map<string, number>();
  allKeys.forEach(key => {
    const match = key.match(/^bull:([^:]+):/);
    if (match) {
      const name = match[1];
      queueCounts.set(name, (queueCounts.get(name) || 0) + 1);
    }
  });

  console.log('큐별 키 수:');
  for (const [name, count] of queueCounts) {
    console.log(`  ${name}: ${count}개`);
  }

  // 전체 삭제
  await redis.del(...allKeys);
  console.log(`\n✓ ${allKeys.length}개 키 삭제 완료`);

  console.log('\nBull Board 새로고침하면 초기화된 상태로 보일 거야.\n');

  await redis.quit();
  process.exit(0);
}

main().catch(console.error);
