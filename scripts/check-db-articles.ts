import mongoose from 'mongoose';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const targetId = Number(process.argv[2]);
  const targetCafe = process.argv[3] || '25729954';

  if (targetId) {
    const art = await db.collection('publishedarticles').findOne(
      { cafeId: targetCafe, articleId: targetId }
    );
    if (!art) {
      console.log(`DB에 #${targetId} 없음!`);
      return;
    }
    console.log(`\n=== #${art.articleId} "${art.keyword}" ===`);
    console.log(`writer: ${art.writerAccountId}`);
    console.log(`publishedAt: ${art.publishedAt}`);
    console.log(`commentCount: ${art.commentCount}, replyCount: ${art.replyCount}`);
    console.log(`comments (${(art.comments || []).length}개):`);
    for (const c of (art.comments || [])) {
      console.log(`  [${c.type}] ${c.accountId} | commentId: ${c.commentId || 'N/A'} | idx: ${c.commentIndex ?? 'N/A'} | seq: ${c.sequenceId || 'N/A'}`);
    }
  }

  await mongoose.disconnect();
};
main();
