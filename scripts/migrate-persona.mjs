import mongoose from 'mongoose';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log('MongoDB 연결됨');

  // personaCategory -> personaId로 마이그레이션
  const result = await mongoose.connection.db.collection('accounts').updateMany(
    { personaCategory: { $exists: true } },
    [
      { $set: { personaId: '$personaCategory' } },
      { $unset: 'personaCategory' }
    ]
  );

  console.log('마이그레이션 결과:', result);

  // 확인
  const accounts = await mongoose.connection.db.collection('accounts')
    .find({}, { projection: { accountId: 1, personaId: 1, _id: 0 } })
    .toArray();
  console.log('업데이트된 계정:', JSON.stringify(accounts, null, 2));

  await mongoose.disconnect();
  console.log('완료!');
}

migrate().catch(console.error);
