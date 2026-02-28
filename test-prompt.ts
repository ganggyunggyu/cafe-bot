import { buildShortDailyPrompt } from './src/features/viral/prompts/build-short-daily-prompt';

const testPrompt = async () => {
  const input = {
    keyword: '퇴근 후 산책',
    contentType: 'lifestyle' as const,
  };

  const prompt = buildShortDailyPrompt(input);
  
  console.log('=== 생성된 프롬프트 ===');
  console.log(prompt);
  console.log('\n=== 프롬프트 길이:', prompt.length, '자 ===\n');

  const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';
  
  console.log('=== API 요청 중... ===');
  
  try {
    const response = await fetch(`${CONTENT_API_URL}/generate/test/cafe-daily`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        model: 'gemini-2.0-flash-exp',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API 에러:', response.status, errorText);
      process.exit(1);
    }

    const result = await response.json();
    
    console.log('\n=== API 응답 ===');
    console.log('성공:', result.success);
    console.log('모델:', result.model);
    console.log('소요시간:', result.elapsed, 'ms');
    console.log('\n=== 생성된 콘텐츠 ===');
    console.log(result.content);
    
  } catch (error) {
    console.error('요청 실패:', error);
    process.exit(1);
  }
};

testPrompt();
