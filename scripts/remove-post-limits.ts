import mongoose from 'mongoose';
import { QueueSettings } from '../src/shared/models/queue-settings';
import { Account } from '../src/shared/models/account';
import { connectDB } from '../src/shared/lib/mongodb';

async function main() {
  await connectDB();
  
  console.log('=== 계정당 글 작성 개수 제한 해제 ===\n');
  
  // 1. QueueSettings 업데이트
  console.log('1. QueueSettings 확인/업데이트 중...');
  const settings = await QueueSettings.findOne();
  
  if (settings) {
    console.log('   현재 설정:', JSON.stringify(settings.limits, null, 2));
    
    settings.limits.enableDailyPostLimit = false;
    settings.limits.maxCommentsPerAccount = 0;
    await settings.save();
    
    console.log('   → enableDailyPostLimit: false로 변경 완료');
    console.log('   → maxCommentsPerAccount: 0으로 변경 완료');
  } else {
    console.log('   QueueSettings 없음 (기본값이 false라 괜찮음)');
  }
  
  // 2. 모든 계정의 dailyPostLimit 제거
  console.log('\n2. 계정 dailyPostLimit 제거 중...');
  
  const accounts = await Account.find({});
  console.log(`   총 계정 수: ${accounts.length}`);
  
  let limitedCount = 0;
  for (const acc of accounts) {
    if (acc.dailyPostLimit && acc.dailyPostLimit > 0) {
      console.log(`   - ${acc.id}: ${acc.dailyPostLimit}개 제한 → 제한 해제`);
      acc.dailyPostLimit = undefined;
      await acc.save();
      limitedCount++;
    }
  }
  
  if (limitedCount === 0) {
    console.log('   제한 있는 계정 없음 (이미 모두 해제됨)');
  } else {
    console.log(`   총 ${limitedCount}개 계정 제한 해제 완료`);
  }
  
  console.log('\n=== 완료 ===');
  console.log('이제 모든 계정은 일일 글 작성 개수 제한 없음');
  
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('에러:', err);
  process.exit(1);
});
