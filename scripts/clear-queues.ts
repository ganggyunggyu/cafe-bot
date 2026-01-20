import Redis from 'ioredis';
import { getAllAccounts } from '../src/shared/config/accounts';
import { connectDB } from '../src/shared/lib/mongodb';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  await connectDB();
  const redis = new Redis(REDIS_URL);

  console.log('\n=== Redis 큐 데이터 정리 ===\n');

  const accounts = await getAllAccounts();

  // 계정별 큐 정리
  for (const account of accounts) {
    const queueName = `task_${account.id}`;
    const keys = await redis.keys(`bull:${queueName}:*`);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[${account.id}] ${keys.length}개 키 삭제`);
    } else {
      console.log(`[${account.id}] 정리할 데이터 없음`);
    }
  }

  // Generate 큐 정리
  const generateKeys = await redis.keys('bull:generate:*');
  if (generateKeys.length > 0) {
    await redis.del(...generateKeys);
    console.log(`[generate] ${generateKeys.length}개 키 삭제`);
  }

  // 기타 bull 관련 키 정리
  const otherKeys = await redis.keys('bull:*');
  if (otherKeys.length > 0) {
    await redis.del(...otherKeys);
    console.log(`[기타] ${otherKeys.length}개 키 삭제`);
  }

  console.log('\n완료! Bull Board 새로고침하면 초기화된 상태로 보일 거야.\n');

  await redis.quit();
  process.exit(0);
}

main().catch(console.error);
