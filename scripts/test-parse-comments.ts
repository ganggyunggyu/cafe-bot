import { parseViralResponse } from '@/features/viral/viral-parser';

const testInput = `[제목]
45살 임신 확률 언니 선물 챙겨봤어요~

[본문]
혹시 주변에 40대 중반에 늦둥이
준비하시는 분들 계신가요?

저희 친언니가 요즘 45살 임신 확률
이것저것 알아보고 있거든요!

[댓글]
[댓글1] 몸에 열 많으면 흑염소 안 맞는다고 하더라고요
[작성자-1] 헉 그런가요ㅠㅠ 언니는 수족냉증 있어서 다행이네요
[댓글러-1] 아하 그럼 오히려 몸 따뜻해져서 좋을 수도 있겠네용

[댓글2] 저희 언니도 늦둥이 가졌는데 진짜 남일 같지 않네요ㅠㅠ
[작성자-2] 동생이 챙겨주는 게 제일 낫다 싶어서 이것저것 보냈어요!
[댓글러-2] 맞아요 가족이 최고죠 늦둥이 꼭 성공하시길 응원해요

[댓글3] 임준할 때 많이들 먹더라고요 저도 한,려담원 먹었었는데
지리산 흑염소라서 그런지 누린내 안 나서 잘 먹었어요
[작성자-3] 오 냄새 안 나면 다행이네요
혹시 먹고 살찔까 봐 걱정인데 괜찮았나요?
[댓글러-3] 저도 걱정했는데 기름기 뺀 거라 그런지 저는 괜찮았어요

[댓글4] 홍삼은 안 맞는 사람 은근 많대요 조심해서 드셔야 해요
[작성자-4] 아 진짜요!? 일단 연하게 먹어보라고 해야겠네요
[제3자-4] 저도 홍삼 먹고 오히려 열 올라서 고생했었거든요 조심조심

[댓글5] 언니분 부럽네요 ㅎㅎ 저도 챙겨 먹는 중인데
한,려담원이 묽지 않고 진해서 좋았어요
[작성자-5] 앗 진하다니 좋네요 혹시 주문하면 배송은 오래 걸리나요?
[댓글러-5] 아니요 배송 금방 오더라고요 급할 때 시키기 딱 좋아요

[댓글6] 흑염소가 진짜 도움 되는 거 맞나요? 전 병원 약이 낫다고 보는데요
[작성자-6] 병원도 다니면서 체력 관리용으로 챙겨 먹이려고요ㅠㅠ
[댓글러-6] 아 병원도 가시는군요 그럼 보양식 개념으로 드시면 되겠네요`;

const result = parseViralResponse(testInput);

if (!result) {
  console.log('파싱 실패');
  process.exit(1);
}

console.log('=== 파싱 결과 ===');
console.log('제목:', result.title);
console.log('댓글 수:', result.comments.length);
console.log('');

console.log('=== viralComments.comments 형태 ===');
console.log(JSON.stringify(result.comments, null, 2));

console.log('');
console.log('=== 보기 쉽게 정리 ===');
for (const c of result.comments) {
  const tagMap: Record<string, string> = {
    comment: `댓글${c.index}`,
    author_reply: `작성자-${c.parentIndex}`,
    commenter_reply: `댓글러-${c.parentIndex}`,
    other_reply: `제3자-${c.parentIndex}`,
  };
  const tag = tagMap[c.type] || c.type;
  const hasNl = c.content.includes('\n') ? ' 📝멀티라인' : '';
  console.log(`[${tag}] ${c.content.replace(/\n/g, ' | ')}${hasNl}`);
}
