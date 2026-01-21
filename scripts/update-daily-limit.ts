import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Account } from '../src/shared/models';

// .env.local 로드
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const [key, ...values] = line.split('=');
  if (key && !key.startsWith('#')) {
    process.env[key.trim()] = values.join('=').trim();
  }
}

const MONGODB_URI = process.env.MONGODB_URI || '';

const getRandomLimit = () => Math.floor(Math.random() * 2) + 2; // 2 또는 3

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB 연결됨');

  const accounts = await Account.find({});
  console.log(`총 ${accounts.length}개 계정 발견`);

  for (const account of accounts) {
    const newLimit = getRandomLimit();
    await Account.updateOne(
      { _id: account._id },
      { $set: { dailyPostLimit: newLimit } }
    );
    console.log(`${account.accountId}: ${account.dailyPostLimit} → ${newLimit}`);
  }

  console.log('완료');
  await mongoose.disconnect();
}

main().catch(console.error);
