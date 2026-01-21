/**
 * 기존 Account/Cafe 데이터에 userId 추가 마이그레이션 스크립트
 *
 * 실행: npx tsx --env-file=.env.local scripts/migrate-user-id.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

async function migrate() {
  console.log('MongoDB 연결 중...');
  await mongoose.connect(MONGODB_URI as string);
  console.log('MongoDB 연결 완료');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('DB 연결 실패');
    process.exit(1);
  }

  // 타겟 userId 설정
  const targetUserId = 'user-1768955529317';
  console.log(`\n타겟 유저: 21lab (${targetUserId})`);

  // 2. Account 마이그레이션 (default-user 포함)
  const accountsCollection = db.collection('accounts');
  const accountFilter = {
    $or: [
      { userId: { $exists: false } },
      { userId: null },
      { userId: '' },
      { userId: 'default-user' },
    ],
  };
  const accountsToMigrate = await accountsCollection.countDocuments(accountFilter);

  console.log(`\n[Account] 마이그레이션 대상: ${accountsToMigrate}개`);

  if (accountsToMigrate > 0) {
    const accountResult = await accountsCollection.updateMany(
      accountFilter,
      { $set: { userId: targetUserId } }
    );
    console.log(`[Account] ${accountResult.modifiedCount}개 업데이트 완료`);
  }

  // 3. Cafe 마이그레이션 (default-user 포함)
  const cafesCollection = db.collection('cafes');
  const cafeFilter = {
    $or: [
      { userId: { $exists: false } },
      { userId: null },
      { userId: '' },
      { userId: 'default-user' },
    ],
  };
  const cafesToMigrate = await cafesCollection.countDocuments(cafeFilter);

  console.log(`\n[Cafe] 마이그레이션 대상: ${cafesToMigrate}개`);

  if (cafesToMigrate > 0) {
    const cafeResult = await cafesCollection.updateMany(
      cafeFilter,
      { $set: { userId: targetUserId } }
    );
    console.log(`[Cafe] ${cafeResult.modifiedCount}개 업데이트 완료`);
  }

  // 4. 결과 확인
  console.log('\n=== 마이그레이션 결과 ===');

  const totalAccounts = await accountsCollection.countDocuments({ userId: targetUserId, isActive: true });
  const totalCafes = await cafesCollection.countDocuments({ userId: targetUserId, isActive: true });

  console.log(`[Account] ${targetUserId} 소유: ${totalAccounts}개`);
  console.log(`[Cafe] ${targetUserId} 소유: ${totalCafes}개`);

  await mongoose.disconnect();
  console.log('\n완료!');
}

migrate().catch((err) => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
