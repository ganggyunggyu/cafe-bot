import { generateViralContent } from '@/shared/api/content-api';
import { buildViralPrompt } from '@/features/viral/viral-prompt';

const keywords = [
  '오전 산책 날씨 좋다',
  '점심 뭐 먹을까',
  '자기 전 한 잔',
];

const main = async () => {
  for (const keyword of keywords) {
    const prompt = buildViralPrompt({ keyword }, '일상');
    console.log(`\n${'='.repeat(60)}`);
    console.log(`키워드: ${keyword}`);
    console.log('='.repeat(60));

    const { content, elapsed } = await generateViralContent({ prompt, model: 'gemini-3.1-pro-preview' });
    console.log(`소요: ${elapsed}s\n`);
    console.log(content);
  }
};

main().catch(console.error);
