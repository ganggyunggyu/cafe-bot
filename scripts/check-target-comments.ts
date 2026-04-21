import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import mongoose from 'mongoose';
import { PublishedArticle } from '../src/shared/models';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const targets = [
    { cafeId: '25636798', articleId: 31308 },
    { cafeId: '25636798', articleId: 31309 },
  ];
  for (const t of targets) {
    const a = await PublishedArticle.findOne(t).lean();
    if (!a) { console.log(`NO: ${t.articleId}`); continue; }
    const byAcc: Record<string, number> = {};
    for (const c of a.comments || []) {
      byAcc[c.accountId] = (byAcc[c.accountId] || 0) + 1;
    }
    console.log(`#${t.articleId} writer=${a.writerAccountId} total=${a.comments?.length || 0}`);
    console.log('  byAcc:', byAcc);
  }
  await mongoose.disconnect();
};
main().catch(e => { console.error(e); process.exit(1); });
