import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

interface KeywordEntry {
  category: string;
  keyword: string;
  ref: string;
}

const KEYWORDS: KeywordEntry[] = [
  {
    category: '산후조리',
    keyword: '산모 음식',
    ref: `동생이 일주일 전에
아기를 낳았어요!
이제 막 산후조리 시작한
상태라 그런지
몸이 많이 힘들다고 하더라고요ㅠㅠ
통증도 있고 기운도 없다고 하고요
목소리만 들어도 아직 많이
지쳐 있는 느낌이더라고요..
그래서 며칠 제가 가서
도와주려고 하는데요.
막상 가보려고 하니까
산모 음식 챙기는 게
제일 고민이네요ㅠㅠ
미역국은 기본이라
계속 먹고 있다고 하더라고요.
조리원에서도 거의
매 끼니 나온다고 하고요.
근데 오래 먹으면
속이 더부룩해질 수 있다는 말도 있어서
다른 산모 음식도 같이 챙겨줘야 하나 싶어
괜히 이것저것 찾아보고 있어요ㅠㅠ
검색하다 보니 단백질이나
철분도 중요하다고 하고
몸 회복하려면 먹는 것도
신경 써야 한다고 해서
더 고민이 되네요ㅠ..
혹시 출산 직후에 드셨던
산모 음식 중에
속 편하게 먹을 수 있으면서
기운 회복에 도움 됐던
메뉴 있으셨을까요??
경험 있으시면 알려주시면
많이 참고가 될 것 같아요!ㅠㅠ
댓글 부탁드립니다~`,
  },
  {
    category: '임신준비',
    keyword: '동결 자연주기',
    ref: `아이를 만날 준비를 하고 있는데
생각보다 쉽게 찾아오지 않네요..
자연임신을 계속 시도해보다가
최근에 시술로 바꾸게 됐어요..!
병원에서 동결 자연주기 하자고 해서
이번에 시도하고 왔는데요..
조금 혼란스러워서 글을 남겨요ㅠ
배아 이식하고 6일째 되는 날에
습관처럼 임테기를 했는데
단호박 한줄이 나오더라고요..!
그런데 다음날이 피검사일이라
혹시나 하고 얼리임테기로
다시 테스트 해봤거든요?
그런데 두줄이 떴어요..!!
약은 지금까지 질정 하루 2번만
하고 있는게 전부인데..
왠지 불안한 마음이 자꾸 드네요ㅠ
동결 자연주기 믿어도 될까요?ㅠㅠ
검색해보니깐 약기운 때문에
가짜 양성이 나올 수도 있다던데..
처음 시도한 시험관에서
이렇게 두 줄 뜨니깐 의심이 드네요..;;
혹시 저처럼 동결 자연주기 하다가
두 줄 나오신 분 계시나요..?
약 때문에 그런건지 아니면 임신인지
혹시 경험담 있으시면 알려주세요ㅠ
그리고 임신 준비하면서
도움이 됐던 관리방법 있으시면
같이 공유 부탁드립니다..!!`,
  },
  {
    category: '임신준비',
    keyword: '임신준비 금연 성공',
    ref: `계속되는 임신 실패로
벌써 난임 2년차가 됐어요ㅠ
처음엔 금방 될 줄 알았는데
시간이 길어지니까 마음이
점점 조급해지는 것 같네요
그동안 저만 검사하고
약도 먹고 주사도 맞으면서
열심히 임신준비 해왔는데
요즘은 방향을 다시
생각해보게 되더라구요
남편도 기본적인 임신준비 금연이랑
금주, 식단 정도만 하고 있었는데
이제는 영양제나 한약 같은 것도
같이 챙겨야 하나 고민이에요
혹시 남편분 임신준비 금연부터
시작해서 영양제나 생활관리 같이
해보신 분 계신가요?
남자 임신준비 금연 이후
좋아졌다는 경험 있으시면
추천 부탁드려요~`,
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const generateOne = async (entry: KeywordEntry, idx: number) => {
  const prompt = buildOwnKeywordPrompt({ keyword: entry.keyword, keywordType: 'own' });

  const angleLine = prompt.split('\n').find((l) => l.includes('콘텐츠 앵글:'));
  const angleType = angleLine?.match(/콘텐츠 앵글: (.+?)\]/)?.[1] || '?';

  console.log(`  [${idx}] 앵글: ${angleType}`);

  const response = await fetch(`${CONTENT_API_URL}/generate/cafe-total`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: prompt, ref: entry.ref }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  console.log(`      완료 - ${data.model}, ${data.elapsed}ms`);
  return { content: data.content as string, angleType };
};

const main = async () => {
  console.log(`\n참조원고 기반 원고 생성 (${KEYWORDS.length}개)`);
  console.log(`API: ${CONTENT_API_URL}\n`);

  const results: { category: string; keyword: string; angleType: string; content: string }[] = [];

  for (let i = 0; i < KEYWORDS.length; i++) {
    const entry = KEYWORDS[i];
    console.log(`--- ${i + 1}/${KEYWORDS.length} [${entry.category}] ${entry.keyword} ---`);
    try {
      const { content, angleType } = await generateOne(entry, i + 1);
      results.push({ category: entry.category, keyword: entry.keyword, angleType, content });
    } catch (err) {
      console.log(`      실패: ${err instanceof Error ? err.message : err}`);
    }
    if (i < KEYWORDS.length - 1) await sleep(3000);
  }

  // MD 출력
  const mdOutput = results
    .map((r, i) => `## ${i + 1}. [${r.category}] [${r.angleType}] ${r.keyword}\n\n${r.content}\n\n---\n`)
    .join('\n');

  const mdPath = path.resolve(__dirname, '../ref-test-results.md');
  const header = `# 참조원고 기반 원고 테스트\n\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
  fs.writeFileSync(mdPath, header + mdOutput, 'utf-8');

  console.log(`\n저장: ${mdPath}`);
  console.log(`성공: ${results.length}/${KEYWORDS.length}`);
};

main().catch((err) => {
  console.error('\n오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
