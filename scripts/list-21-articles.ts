import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import mongoose from 'mongoose';
import { PublishedArticle } from '../src/shared/models';
import { Account } from '../src/shared/models/account';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const start = new Date('2026-04-21T00:00:00+09:00');
  const end = new Date('2026-04-22T00:00:00+09:00');
  const articles = await PublishedArticle.find({
    cafeId: { $in: ['25636798', '25227349'] },
    publishedAt: { $gte: start, $lt: end },
  }).sort({ cafeId: 1, publishedAt: 1 }).lean();

  for (const a of articles) {
    const acc = await Account.findOne({ accountId: a.writerAccountId }).lean();
    console.log(`${a.cafeId}/${a.articleId} | ${a.writerAccountId}(${acc?.nickname}) | [${a.postType}] | ${a.title}`);
  }
  console.log(`\ntotal: ${articles.length}`);
  await mongoose.disconnect();
};
main().catch(e => { console.error(e); process.exit(1); });
