import mongoose from 'mongoose';

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cafe-bot');

  const Account = mongoose.connection.collection('accounts');

  const before = await Account.findOne({ accountId: 'aryunt' });
  console.log('현재 상태:', before?.isActive, '| role:', before?.role);

  const result = await Account.updateOne(
    { accountId: 'aryunt' },
    { $set: { isActive: true } }
  );
  console.log('활성화:', result.modifiedCount > 0 ? 'OK' : '변경없음');

  const after = await Account.findOne({ accountId: 'aryunt' });
  console.log('변경 후:', after?.isActive, '| role:', after?.role);

  await mongoose.disconnect();
  process.exit(0);
};

run();
