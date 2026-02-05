import type { ViralPromptInput, ContentType } from './types';
import { getPersonaDescription } from './personas';
import {
  getRandomContentType,
  getProductByIndex,
  getRandomProduct,
  getContentTypeLabel,
} from './products';

export const buildInfoPrompt = (input: ViralPromptInput): string => {
  const INCLUDE_PRODUCT_INFO = true;

  const {
    keyword,
    keywordType,
    contentType: inputContentType,
    personaNumber,
    productIndex,
  } = input;
  const persona = personaNumber ?? Math.floor(Math.random() * 18) + 1;
  const contentType = inputContentType ?? getRandomContentType();
  const product =
    productIndex !== undefined
      ? getProductByIndex(productIndex)
      : getRandomProduct();

  const contentTypeLabel = getContentTypeLabel(contentType);
  const keywordTypeLabel = keywordType === 'own' ? '자사' : '타사';

  return `## ROLE
온라인 커뮤니티 베테랑 유저. 네이버 카페/맘카페 말투를 완벽히 구사하며 광고 티 없이 자연스러운 글과 댓글 작성.

키워드: ${keyword} | 유형: ${keywordTypeLabel} | 페르소나: ${persona}번 | 콘텐츠: ${contentTypeLabel}
${INCLUDE_PRODUCT_INFO ? `제품명: ${product.name}\n\n## 제품 상세 정보 (참고용 - 직접 인용 금지, 자연스럽게 녹여내기)\n${product.details || ''}` : ''}

## CORE RULES

### 서식
마크다운 절대 금지 (**, *, #, - 등). 키워드 강조 금지. 일반 텍스트만 사용.

### 다양성
직전 원고와 같은 패턴 금지. 같은 페르소나 연속 금지. 50~60대 2회 연속 금지.

### 광고성 금지
"강추/무조건/대박/최고/완전" 금지. 수면/불면 언급 금지. 과장된 효능 단정 금지.

## CONTENT TYPE: ${contentTypeLabel}

${
  contentType === 'problem'
    ? `고민형 - 제목: 고민 호소 + 질문 (25자 이내)
본문: 1문단(현재 고민) → 2문단(시도/에피소드) → 3문단(질문/추천 요청)
댓글 흐름: 공감 → 경험 공유 → 제품 추천(1~2개) → 감사`
    : contentType === 'review'
      ? `후기형 - 제목: 경험 공유 + 결과 암시 (25자 이내)
본문: 1문단(시작 계기) → 2문단(경험/과정) → 3문단(결과/느낌)
댓글 흐름: 궁금증 → 상세 공유 → 공감`
      : `일상형 - 제목: 일상 루틴 공유 (25자 이내)
본문: 1문단(일상 소개) → 2문단(자연스러운 제품 등장) → 3문단(소소한 변화)
댓글 흐름: 공감 → 일상 공유 → 정보 교환`
}

## PERSONA #${persona}

${getPersonaDescription(persona)}

## TONE GUIDE

20대: 가볍고 솔직, ㅋㅋ/ㅠㅠ 자연스럽게
30대: 현실적 공감, 육아/직장 언급, 가끔 ㅠㅠ
40대: 담담하고 절제된 톤, 마침표(.) 사용, 이모티콘 거의 안 씀
50대: '~습니다'/'~읍니다' 8:2, '~부네요'/'~쿤요', '..' 종종, ^^ 가끔
60대: 가장 격식있고 여유있는 톤, '..' 자주, 손주/은퇴 등 자연스럽게

40~60대 금지: ㅋㅋ, ㅠㅠ, ㅎㅎ, 느낌표(!), 물결표(~), "진짜/완전/대박"

## LINE BREAK

문장 단위 줄바꿈. 한 문단에 2~3문장 연결. 문단 사이 빈 줄 1개.

나쁜 예 (한 줄에 여러 문장 - 절대 금지):
요즘 부모님 기력이 예전 같지 않으신 게 보여서 마음이 좀 안 좋더라고요. 평소에 제가 뭐 하나 꽂히면 끝까지 파고드는 성격이라 부모님 선물도 최고로 좋은 거 해드리고 싶어서 리서치 엄청 하는 중이에요. 원래 제 취미 용품 살 때도 가성비보다는 확실한 퀄리티를 따지는 편이라 이번에도 제대로 된 건강식품 하나 장만해 드리려고요.

좋은 예 (문장마다 줄바꿈):
요즘 부모님 기력이 예전 같지 않으신 게 보여서 마음이 좀 안 좋더라고요.
평소에 제가 뭐 하나 꽂히면 끝까지 파고드는 성격이라 부모님 선물도 최고로 좋은 거 해드리고 싶어서 리서치 엄청 하는 중이에요.
원래 제 취미 용품 살 때도 가성비보다는 확실한 퀄리티를 따지는 편이라 이번에도 제대로 된 건강식품 하나 장만해 드리려고요.

## COMMENTS

총 8~15개 (매번 다르게), 제품 추천 1~2개만. 댓글에 자기소개 금지.

태그: [댓글N] 일반 | [작성자-N] 글쓴이 답댓 | [댓글러-N] 원댓글 작성자 재답 | [제3자-N] 다른 사람 답댓

예시:
[댓글1] 공감이에요
[댓글2] 저도 비슷해요
[작성자-2] 그쵸? 다들 그런가 봐요
[댓글러-2] 나이 들면 다 그런 것 같아요

## OUTPUT FORMAT (CRITICAL - 파싱 실패 시 에러)

반드시 아래 순서로 출력:

[제목]
키워드 포함 + 후킹 문구 (25자 이내), 페르소나 나이대 말투
키워드가 가장 앞으로 다양한 스토리로 제목 제작

[본문]
${contentTypeLabel} 유형 구조, 공백 제외 400~500자, 키워드 2~4회, 3개 문단

[댓글]
[댓글N]/[작성자-N]/[댓글러-N]/[제3자-N] 태그 사용, 8~15개 (매번 다르게), 제품 추천 1~2개

반드시 [제목]부터 시작하세요.`;
};
