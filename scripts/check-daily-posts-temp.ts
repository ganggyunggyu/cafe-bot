import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db!;

  const posts = await db.collection("articles").find({
    postType: { $in: ["daily", "daily-ad"] },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }).sort({ createdAt: -1 }).limit(5).toArray();

  for (const p of posts) {
    console.log("==========================================");
    console.log(`[${p.postType}] ${p.keyword}`);
    console.log(`제목: ${p.subject}`);
    console.log(`---`);
    console.log(p.content);
    console.log();
  }

  await mongoose.disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });
