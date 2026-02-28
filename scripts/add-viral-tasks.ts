import { connectDB } from '@/shared/lib/mongodb';
import { Account, Cafe } from '@/shared/models';
import { addTaskJob } from '@/shared/lib/queue';
import { generateContent } from '@/shared/api/content-api';

const keywords = [
  { keyword: '말초신경병증증상', category: '광고' },
  { keyword: '남자수족냉증', category: '일상' },
  { keyword: '임산부수족냉증', category: '광고' }
];

async function main() {
  await connectDB();
  
  const writerAccount = await Account.findOne({ 
    accountId: 'akepzkthf12',
    userId: 'user-1768955253636',
    role: 'writer'
  }).lean();
  
  const cafe = await Cafe.findOne({ name: '으스스' }).lean();
  
  if (!writerAccount || !cafe) {
    console.error('계정 또는 카페를 찾을 수 없음');
    process.exit(1);
  }
  
  console.log('Writer:', writerAccount.nickname);
  console.log('Cafe:', cafe.name);
  
  for (const { keyword, category } of keywords) {
    console.log(`\\n처리 중: ${keyword}`);
    
    const prompt = `[키워드] ${keyword}
[카테고리] ${category}
[스타일] 자사 홍보 (흑염소진액)
[요청] 위 키워드로 네이버 카페에 올릴 글을 작성해주세요.
제목은 30자 이내, 본문은 500자 내외로 작성.
댓글 2개와 답글도 포함해주세요.

형식:
[제목] 글 제목
[본문] 글 내용
[댓글1] 첫 번째 댓글
[답글1-1] 작성자 답글
[댓글2] 두 번째 댓글`;

    const result = await generateContent(prompt);
    
    const titleMatch = result.match(/\[제목\]\s*(.+)/);
    const bodyMatch = result.match(/\[본문\]\s*([\s\S]+?)(?=\[댓글|$)/);
    
    const title = titleMatch ? titleMatch[1].trim() : `${keyword} 관련 정보`;
    const body = bodyMatch ? bodyMatch[1].trim() : result;
    
    console.log('생성된 제목:', title);
    
    await addTaskJob(writerAccount.accountId, {
      type: 'post',
      cafeId: cafe.cafeId,
      menuId: cafe.menuId,
      subject: title,
      content: body,
      options: {
        allowComment: true,
        allowScrap: true,
        allowCopy: false,
        useAutoSource: false,
        useCcl: false
      }
    });
    
    console.log('✅ 큐에 추가됨');
  }
  
  console.log('\\n=== 완료 ===');
  console.log('3개 글 작업이 큐에 추가됨');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
