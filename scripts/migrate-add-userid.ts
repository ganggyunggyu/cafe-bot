/**
 * 기존 Account, Cafe 데이터에 userId 필드 추가 마이그레이션
 * 실행: npx tsx scripts/migrate-add-userid.ts
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/shared/lib/mongodb';

const DEFAULT_USER_ID = 'default-user';

async function migrate() {
  await connectDB();

  console.log('\n=== userId 마이그레이션 시작 ===\n');

  // 1. 기존 unique 인덱스 삭제 (accountId, cafeId)
  try {
    await mongoose.connection.collection('accounts').dropIndex('accountId_1');
    console.log('[Account] 기존 accountId unique 인덱스 삭제');
  } catch {
    console.log('[Account] 기존 인덱스 없음 (스킵)');
  }

  try {
    await mongoose.connection.collection('cafes').dropIndex('cafeId_1');
    console.log('[Cafe] 기존 cafeId unique 인덱스 삭제');
  } catch {
    console.log('[Cafe] 기존 인덱스 없음 (스킵)');
  }

  // 2. Account 컬렉션에 userId 추가
  const accountResult = await mongoose.connection.collection('accounts').updateMany(
    { userId: { $exists: false } },
    { $set: { userId: DEFAULT_USER_ID } }
  );
  console.log(`[Account] ${accountResult.modifiedCount}개 문서에 userId 추가`);

  // 3. Cafe 컬렉션에 userId 추가
  const cafeResult = await mongoose.connection.collection('cafes').updateMany(
    { userId: { $exists: false } },
    { $set: { userId: DEFAULT_USER_ID } }
  );
  console.log(`[Cafe] ${cafeResult.modifiedCount}개 문서에 userId 추가`);

  // 4. 새 복합 인덱스 생성
  await mongoose.connection.collection('accounts').createIndex(
    { userId: 1, accountId: 1 },
    { unique: true }
  );
  console.log('[Account] userId+accountId 복합 unique 인덱스 생성');

  await mongoose.connection.collection('cafes').createIndex(
    { userId: 1, cafeId: 1 },
    { unique: true }
  );
  console.log('[Cafe] userId+cafeId 복합 unique 인덱스 생성');

  // 5. userId 인덱스 생성
  await mongoose.connection.collection('accounts').createIndex({ userId: 1 });
  await mongoose.connection.collection('cafes').createIndex({ userId: 1 });
  console.log('[Both] userId 인덱스 생성');

  console.log('\n=== 마이그레이션 완료 ===\n');

  // 결과 확인
  const accounts = await mongoose.connection.collection('accounts').find({}).toArray();
  const cafes = await mongoose.connection.collection('cafes').find({}).toArray();

  console.log(`Account: ${accounts.length}개`);
  accounts.forEach(a => console.log(`  - ${a.accountId} (userId: ${a.userId})`));

  console.log(`\nCafe: ${cafes.length}개`);
  cafes.forEach(c => console.log(`  - ${c.name} (userId: ${c.userId})`));

  process.exit(0);
}

migrate().catch(err => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
