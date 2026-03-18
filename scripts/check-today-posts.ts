import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const articles = await db.collection('publishedarticles').find({ createdAt: { $gte: today } }).toArray();

  const byCafe: Record<string, any[]> = {};
  for (const a of articles) {
    const cafe = a.cafeId || 'unknown';
    if (!byCafe[cafe]) byCafe[cafe] = [];
    byCafe[cafe].push(a);
  }

  console.log(`=== 오늘 발행 총 ${articles.length}건 ===\n`);
  for (const [cafe, arts] of Object.entries(byCafe)) {
    const accMap: Record<string, number> = {};
    for (const a of arts) {
      const acc = a.writerAccountId || 'unknown';
      accMap[acc] = (accMap[acc] || 0) + 1;
    }
    console.log(`카페 ${cafe}: ${arts.length}건`);
    for (const [acc, cnt] of Object.entries(accMap)) {
      console.log(`  ${acc}: ${cnt}건`);
    }
  }

  await mongoose.disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });
