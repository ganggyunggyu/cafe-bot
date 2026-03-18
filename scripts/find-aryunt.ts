import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);

  const Account = mongoose.connection.collection('accounts');

  // 활성화 + 닉네임 업데이트
  const result = await Account.updateOne(
    { accountId: 'aryunt' },
    { $set: { isActive: true, nickname: '먹방 여행기' } }
  );
  console.log('aryunt 활성화:', result.modifiedCount > 0 ? 'OK' : '변경없음');

  // 확인
  const after = await Account.findOne({ accountId: 'aryunt' });
  console.log('변경 후:', {
    isActive: after?.isActive,
    nickname: after?.nickname,
    role: after?.role,
  });

  await mongoose.disconnect();
  process.exit(0);
};
run();
