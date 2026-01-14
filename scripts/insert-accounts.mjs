import mongoose from 'mongoose';
import { readFileSync } from 'fs';

// .env.local 직접 파싱
const envContent = readFileSync('.env.local', 'utf-8');
const mongoUri = envContent.match(/MONGODB_URI=(.+)/)?.[1];

const accounts = [
  {
    accountId: 'akepzkthf12',
    password: '12qwaszx',
    nickname: '테스트2',
    personaId: 'cynical',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 9, end: 18 }, // 오전 9시 ~ 오후 6시
    isActive: true,
  },
  {
    accountId: 'qwzx16',
    password: '12Qwaszx!@',
    nickname: '테스트4',
    personaId: 'ad_skeptic',
    isMain: false,
    dailyPostLimit: 4,
    activityHours: { start: 12, end: 23 }, // 오후 12시 ~ 오후 11시
    isActive: true,
  },
  {
    accountId: 'ggg8019',
    password: '12Qwaszx!@',
    nickname: '테스트5',
    personaId: 'community',
    isMain: true,
    dailyPostLimit: 6,
    activityHours: { start: 7, end: 22 }, // 오전 7시 ~ 오후 10시
    isActive: true,
  },
];

async function insert() {
  await mongoose.connect(mongoUri);
  console.log('MongoDB 연결됨');

  // 기존 데이터 삭제
  await mongoose.connection.db.collection('accounts').deleteMany({});
  console.log('기존 계정 삭제 완료');

  // 새 계정 삽입
  const result = await mongoose.connection.db.collection('accounts').insertMany(accounts);
  console.log('삽입 결과:', result.insertedCount, '개');

  // 확인
  const inserted = await mongoose.connection.db.collection('accounts')
    .find({}, { projection: { accountId: 1, personaId: 1, isMain: 1, _id: 0 } })
    .toArray();
  console.log('삽입된 계정:', JSON.stringify(inserted, null, 2));

  await mongoose.disconnect();
  console.log('완료!');
}

insert().catch(console.error);
