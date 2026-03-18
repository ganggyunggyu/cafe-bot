import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const articles = await db.collection('publishedarticles')
    .find({ createdAt: { $gte: today } })
    .sort({ articleId: 1 })
    .toArray();

  const byCafe: Record<string, any[]> = {};
  for (const a of articles) {
    const cafe = a.cafeId?.toString() || 'unknown';
    if (!byCafe[cafe]) byCafe[cafe] = [];
    byCafe[cafe].push(a);
  }

  for (const [cafeId, arts] of Object.entries(byCafe)) {
    const ids = arts.map((a) => a.articleId).filter(Boolean).sort((a, b) => a - b);
    console.log(`\n=== 카페 ${cafeId} (${arts.length}건) ===`);
    console.log(`articleIds: ${JSON.stringify(ids)}`);

    if (ids.length > 1) {
      const gaps: number[] = [];
      for (let i = 1; i < ids.length; i++) {
        for (let g = ids[i - 1] + 1; g < ids[i]; g++) {
          gaps.push(g);
        }
      }
      if (gaps.length > 0) {
        console.log(`빈 articleId (${gaps.length}개): ${JSON.stringify(gaps)}`);
      } else {
        console.log('빈 articleId 없음');
      }
    }

    // 계정별 발행 수
    const accMap: Record<string, number> = {};
    for (const a of arts) {
      const acc = a.writerAccountId || 'unknown';
      accMap[acc] = (accMap[acc] || 0) + 1;
    }
    console.log('계정별:', Object.entries(accMap).map(([k, v]) => `${k}(${v})`).join(', '));
  }

  await mongoose.disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });
