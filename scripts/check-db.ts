/**
 * DB 상태 확인 스크립트
 * 실행: npx tsx --env-file=.env.local scripts/check-db.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

async function check() {
  console.log('MongoDB 연결 중...');
  await mongoose.connect(MONGODB_URI as string);

  const db = mongoose.connection.db;
  if (!db) {
    console.error('DB 연결 실패');
    process.exit(1);
  }

  // 컬렉션 목록
  const collections = await db.listCollections().toArray();
  console.log('\n=== 컬렉션 목록 ===');
  collections.forEach((c) => console.log(`- ${c.name}`));

  // Users
  console.log('\n=== Users ===');
  const users = await db.collection('users').find({}).toArray();
  users.forEach((u) => {
    console.log(`- ${u.displayName} (userId: ${u.userId}, loginId: ${u.loginId})`);
  });

  // Accounts
  console.log('\n=== Accounts ===');
  const accounts = await db.collection('accounts').find({}).toArray();
  if (accounts.length === 0) {
    console.log('(없음)');
  } else {
    accounts.forEach((a) => {
      console.log(`- ${a.accountId} (userId: ${a.userId || '없음'}, isActive: ${a.isActive})`);
    });
  }

  // Cafes
  console.log('\n=== Cafes ===');
  const cafes = await db.collection('cafes').find({}).toArray();
  if (cafes.length === 0) {
    console.log('(없음)');
  } else {
    cafes.forEach((c) => {
      console.log(`- ${c.name} (userId: ${c.userId || '없음'}, isActive: ${c.isActive})`);
    });
  }

  await mongoose.disconnect();
}

check().catch(console.error);
