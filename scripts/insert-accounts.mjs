import mongoose from 'mongoose';
import { readFileSync } from 'fs';

// .env.local 직접 파싱
const envContent = readFileSync('.env.local', 'utf-8');
const mongoUri = envContent.match(/MONGODB_URI=(.+)/)?.[1];

const accounts = [
  {
    accountId: 'cookie4931',
    password: 'akfalwk12!',
    nickname: '얼음땡 - 준4',
    isMain: true,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'wound12567',
    password: 'akfalwk12',
    nickname: '투디치과 스킨블',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'precede1451',
    password: 'akfalwk12!!',
    nickname: '토토리토',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'dyulp',
    password: 'sadito0229!',
    nickname: '운명의 마법사',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'lesyt',
    password: 'sadito0229!',
    nickname: '맛집 탐험대',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'aryunt',
    password: 'sadito0229!',
    nickname: '먹방 여행기',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'loand3324',
    password: 'akfalwk123!',
    nickname: '라우드',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'fail5644',
    password: 'akfalwk11!',
    nickname: '고구마스틱',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'compare14310',
    password: 'akfalwk112!',
    nickname: '룰루랄라',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'gmezz',
    password: 'sadito0006',
    nickname: '글로벌',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'zhuwl',
    password: 'akfalwk12',
    nickname: '새로운',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'enugii',
    password: 'sadito0229!',
    nickname: '은길',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'nnhha',
    password: 'akfalwk12',
    nickname: '떠나는날의 이야기',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'selzze',
    password: 'sadito0229!',
    nickname: '해리포터',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'bjwuo',
    password: 'sadito0229!',
    nickname: '불꽃',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'ganir',
    password: 'sadito0229!',
    nickname: '다이어리',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'shcint',
    password: 'sadito0229!',
    nickname: '꿈꾸는 나날',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
  },
  {
    accountId: 'aqahdp5252',
    password: 'cebtg95289',
    nickname: '',
    isMain: false,
    dailyPostLimit: 5,
    activityHours: { start: 0, end: 24 },
    isActive: true,
    restDays: [],
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
    .find({}, { projection: { accountId: 1, nickname: 1, isMain: 1, activityHours: 1, _id: 0 } })
    .toArray();
  console.log('삽입된 계정:', JSON.stringify(inserted, null, 2));

  await mongoose.disconnect();
  console.log('완료!');
}

insert().catch(console.error);
