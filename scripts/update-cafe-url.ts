import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

import mongoose from 'mongoose';
import { connectDB } from '../src/shared/lib/mongodb';

interface CafeData {
  cafeId: string;
  cafeUrl: string;
  name: string;
  menuId: string;
  categories: string[];
  isDefault: boolean;
}

const CAFES: CafeData[] = [
  {
    cafeId: '31640041',
    cafeUrl: 'usshdd',
    name: '으스스',
    menuId: '1',
    categories: ['자유게시판', '중고거래', '정보공유', '질문/답변'],
    isDefault: true,
  },
  {
    cafeId: '31642514',
    cafeUrl: 'btaku',
    name: '벤타쿠',
    menuId: '1',
    categories: ['자유게시판', '애니메이션', '만화', '게임', '피규어', '굿즈', '정보/후기', '질문/답변', '중고거래'],
    isDefault: false,
  },
  {
    cafeId: '31646389',
    cafeUrl: 'dhml',
    name: '다향만리',
    menuId: '1',
    categories: ['자유게시판', '차 공부방', '차의 효능', '묻고 답하기', '오늘의 찻자리', '나의 찻잔', '차와 주전부리', '차 한 잔 수다'],
    isDefault: false,
  },
];

async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    console.error('DB 연결 실패');
    process.exit(1);
  }
  const collection = db.collection('cafes');

  console.log('=== 카페 URL 업데이트 시작 ===\n');

  // 전체 컬렉션 목록 확인
  const collections = await db.listCollections().toArray();
  console.log('컬렉션 목록:', collections.map(c => c.name));

  // 먼저 컬렉션 확인
  const all = await collection.find({}).toArray();
  console.log('caves 데이터:', all.length, '건');

  // cafes 컬렉션 사용
  const cafesCollection = db.collection('cafes');
  const cafesAll = await cafesCollection.find({}).toArray();
  console.log('cafes 데이터:', cafesAll.length, '건');
  console.log('');

  for (const cafe of CAFES) {
    const existing = await cafesCollection.findOne({ cafeId: cafe.cafeId });

    if (existing) {
      // 업데이트
      await cafesCollection.updateOne(
        { cafeId: cafe.cafeId },
        { $set: { cafeUrl: cafe.cafeUrl } }
      );
      console.log(`✓ 업데이트: ${cafe.name} (${cafe.cafeId}) → ${cafe.cafeUrl}`);
    } else {
      // 새로 추가
      await cafesCollection.insertOne({
        ...cafe,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`+ 추가: ${cafe.name} (${cafe.cafeId}) → ${cafe.cafeUrl}`);
    }
  }

  console.log('\n=== 업데이트 완료 ===');
  process.exit(0);
}

main().catch(console.error);
