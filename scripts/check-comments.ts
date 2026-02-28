import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db!;

  // 오늘 발행된 글 조회
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const articles = await db.collection('publishedarticles').find({
    createdAt: { $gte: today },
  }).sort({ createdAt: 1 }).toArray();

  console.log(`=== 오늘 발행된 글: ${articles.length}개 ===\n`);

  for (const article of articles) {
    const comments = article.comments || [];
    console.log(`#${article.articleId} [${article.writerAccountId}] "${(article.title || article.keyword || '').slice(0, 30)}"`);
    console.log(`  댓글 ${comments.length}개:`);

    // 중복 체크
    const seen = new Map<string, number>();
    for (const c of comments) {
      const key = `${c.accountId}:${c.type}`;
      seen.set(key, (seen.get(key) || 0) + 1);
      const ts = c.createdAt ? new Date(c.createdAt).toLocaleTimeString('ko-KR') : '?';
      console.log(`    ${c.type} ${c.accountId} [${ts}] "${(c.content || '').slice(0, 30)}..."`);
    }

    const dupes = [...seen.entries()].filter(([, count]) => count > 1);
    if (dupes.length > 0) {
      console.log(`  ⚠️ 중복: ${dupes.map(([k, v]) => `${k}(${v}회)`).join(', ')}`);
    }
    console.log('');
  }

  // BullMQ completed jobs (다른 키 패턴 확인)
  const Redis = (await import('ioredis')).default;
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  const keys = await redis.keys('bull:*');
  const queueKeys = keys.filter((k) => k.startsWith('bull:task-queue'));
  const keyTypes = new Map<string, number>();
  for (const k of queueKeys) {
    const base = k.replace(/:\d+$/, ':*');
    keyTypes.set(base, (keyTypes.get(base) || 0) + 1);
  }
  console.log('=== Redis 키 패턴 ===');
  for (const [pattern, count] of [...keyTypes.entries()].sort()) {
    console.log(`  ${pattern}: ${count}개`);
  }

  // 큐 이름 확인
  const allQueues = await redis.keys('bull:*:id');
  console.log(`\n큐 목록: ${allQueues.join(', ') || '없음'}`);

  await redis.quit();
  await mongoose.disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });
