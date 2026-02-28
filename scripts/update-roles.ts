import mongoose from 'mongoose';

async function updateRoles() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cafe-bot';
  await mongoose.connect(MONGODB_URI);
  
  const AccountSchema = new mongoose.Schema({
    userId: String,
    accountId: String,
    password: String,
    nickname: String,
    role: String,
    isActive: Boolean
  }, { strict: false });
  
  const Account = mongoose.models.Account || mongoose.model('Account', AccountSchema);
  
  // 글작성 계정 5개
  const writers = ['loand3324', 'fail5644', 'compare14310', 'gmezz', 'dyulp'];
  for (const id of writers) {
    const result = await Account.updateOne({ accountId: id }, { $set: { role: 'writer' } });
    console.log(`${id}: ${result.modifiedCount > 0 ? '✅ 수정됨' : '❌ 실패'}`);
  }
  
  console.log('');
  
  // 댓글작성 계정 15개
  const commenters = ['lesyt', 'aryunt', 'zhuwl', 'enugii', 'nnhha', 'selzze', 'bjwuo', 'ebbte', 'ganir', 'shcint', 'aqahdp5252', 'yenalk', 'dyust', 'momenft5251', 'column13365'];
  for (const id of commenters) {
    const result = await Account.updateOne({ accountId: id }, { $set: { role: 'commenter' } });
    console.log(`${id}: ${result.modifiedCount > 0 ? '✅ 수정됨' : '❌ 실패'}`);
  }
  
  console.log('\n=== 검증 ===');
  const writerCount = await Account.countDocuments({ role: 'writer' });
  const commenterCount = await Account.countDocuments({ role: 'commenter' });
  console.log(`Writer: ${writerCount}개`);
  console.log(`Commenter: ${commenterCount}개`);
  
  process.exit(0);
}

updateRoles().catch(e => { console.error(e); process.exit(1); });
