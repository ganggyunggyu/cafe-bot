import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cafe-bot';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export const connectDB = async (): Promise<typeof mongoose> => {
  // 이미 연결된 경우
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // 연결이 끊겼으면 캐시 초기화
  if (cached.promise && mongoose.connection.readyState === 0) {
    console.log('[MongoDB] 이전 연결 끊김, 캐시 초기화');
    cached.promise = null;
    cached.conn = null;
  }

  if (!cached.promise) {
    console.log('[MongoDB] 새 연결 시도...');
    cached.promise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferCommands: false, // 연결 전 버퍼링 비활성화
    });
  }

  try {
    cached.conn = await cached.promise;

    // 연결 완료 대기 (readyState가 1이 될 때까지)
    if (mongoose.connection.readyState !== 1) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MongoDB 연결 타임아웃'));
        }, 10000);

        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });

        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }

    console.log('[MongoDB] 연결 완료, readyState:', mongoose.connection.readyState);
    return cached.conn;
  } catch (error) {
    console.error('[MongoDB] 연결 실패:', error);
    cached.promise = null;
    cached.conn = null;
    throw error;
  }
}

export default connectDB;
