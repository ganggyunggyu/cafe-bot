import mongoose from "mongoose";
const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db!;
  const docs = await db.collection("publishedarticles").find({ accountId: "qwzx16" }).sort({ createdAt: -1 }).limit(3).toArray();
  for (const d of docs) {
    console.log(`[${d.createdAt}] "${d.subject || d.title || ''}"`);
    console.log(`  cafeId: ${d.cafeId} / articleId: ${d.articleId || d.naverArticleId || '-'}`);
    console.log(`  keyword: ${d.keyword} / status: ${d.status || 'success'}`);
    if (d.articleUrl || d.url) console.log(`  url: ${d.articleUrl || d.url}`);
    console.log();
  }
  console.log(`총 ${docs.length}건`);
  await mongoose.disconnect();
};
main();
