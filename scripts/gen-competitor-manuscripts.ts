import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { google } from 'googleapis';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';
const SHEET_ID = '1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms';
const TAB_NAME = `타사원고_sonnet_${new Date().toISOString().slice(0, 10)}`;
const MODEL = 'claude-sonnet-4-6';

const KEYWORDS = [
  '오한진의 백세알부민',
  '홍천 약도라지청',
  '골드카무트 효소',
  '관절엔 콘드로이친',
  '삼육두유 검은콩과칼슘',
  '김오곤 원장의 한방 다이어트환',
  '뼈엔 엠비피 MBP',
  '여에스더 글루타치온 울트라',
  '레이델 폴리코사놀 더블액션',
  '프롬바이오 헤링오일',
  '뉴트리코어 하이퍼셀 비타민K2',
  '뉴트리코어 코엔자임 Q10 맥스',
  '대원제약 콘드로이친 킹',
  '뉴트리디데이 콜라겐 글루타치온',
  '골드카무트 효소',
  '관절엔 콘드로이친',
  '여에스더 글루타치온 울트라',
  '와사비 다이어트 이소비텍신',
  '레이델 폴리코사놀5',
  '홀랜드앤바렛 종합 비타민',
  '종근당건강 락토핏 코어맥스',
  '대원제약 리포좀 알부민킹',
  '여에스더 글루타치온 울트라',
  '유기농 오르조',
  '핀란디아 블루베리 파우더',
  '오한진의 백세알부민',
  '리즐온 유기농 블루베리스틱',
  '오한진의 백세알부민',
  '레이델 폴리코사놀 더블액션',
  '오한진의 백세알부민',
];

const detectCategory = (keyword: string): string => {
  const map: [RegExp, string][] = [
    [/알부민/, '알부민'],
    [/도라지/, '도라지청'],
    [/효소|카무트/, '효소'],
    [/콘드로이친|관절/, '관절 영양제'],
    [/두유|칼슘/, '칼슘 식품'],
    [/다이어트/, '다이어트 보조제'],
    [/엠비피|MBP|뼈/, '뼈 건강 영양제'],
    [/글루타치온/, '글루타치온'],
    [/폴리코사놀/, '폴리코사놀'],
    [/오일|헤링/, '오메가3/피쉬오일'],
    [/비타민K/, '비타민K'],
    [/코엔자임|Q10/, '코엔자임Q10'],
    [/콜라겐/, '콜라겐'],
    [/이소비텍신|와사비/, '다이어트 보조제'],
    [/비타민/, '종합비타민'],
    [/락토핏|유산균/, '유산균'],
    [/오르조/, '대체 음료'],
    [/블루베리/, '블루베리 건강식품'],
  ];
  for (const [re, cat] of map) {
    if (re.test(keyword)) return cat;
  }
  return '건강 보조제';
};

const ANGLES = ['질문형', '비교고민형', '체험후기형', '추천요청형', '선물고민형'];

const extractBrand = (keyword: string): string | null => {
  const brands: [RegExp, string][] = [
    [/오한진/, '오한진의 백세알부민'],
    [/홍천/, '홍천 약도라지청'],
    [/골드카무트/, '골드카무트'],
    [/삼육/, '삼육두유'],
    [/김오곤/, '김오곤 원장'],
    [/여에스더/, '여에스더'],
    [/레이델/, '레이델'],
    [/프롬바이오/, '프롬바이오'],
    [/뉴트리코어/, '뉴트리코어'],
    [/대원제약/, '대원제약'],
    [/뉴트리디데이/, '뉴트리디데이'],
    [/와사비 다이어트/, '와사비 다이어트'],
    [/홀랜드앤바렛/, '홀랜드앤바렛'],
    [/종근당/, '종근당건강'],
    [/리즐온/, '리즐온'],
    [/핀란디아/, '핀란디아'],
  ];
  for (const [re, name] of brands) {
    if (re.test(keyword)) return name;
  }
  return null;
};

const buildPrompt = (keyword: string, idx: number): string => {
  const category = detectCategory(keyword);
  const angle = ANGLES[idx % ANGLES.length];
  const brand = extractBrand(keyword);

  const brandRule = brand
    ? `1. ★ 키워드 브랜드 "${brand}" 언급 허용 ★
   이 키워드에 포함된 "${brand}"은/는 본문과 댓글에서 자연스럽게 언급 가능.
   단, "${brand}" 외의 다른 실존 브랜드명/제품명은 절대 사용 금지.
   → 다른 브랜드는: "유명한 브랜드", "광고에서 본 거", "다른 데" 등 일반 표현만`
    : `1. ★★★ 모든 브랜드명/제품명 절대 언급 금지 ★★★
   그 어떤 실존 브랜드명/제품명도 본문·댓글 어디에서도 절대 사용 금지.
   → 대신: "유명한 브랜드", "광고에서 본 거", "다른 데" 등 일반 표현만`;

  return `너는 건강 카페에 글을 올리는 일반 회원이야. "${keyword}" 키워드로 검색해서 들어올 사람이 읽을 자연스러운 카페 글을 작성해.

## ★★★ 최우선 규칙 ★★★
${brandRule}
2. 효능 단정 금지: "~에 좋다", "~가 줄었다" 등 의학적 효능 표현 금지 → 개인 체감만 ("컨디션이 좀 나아진 느낌", "덜 무거워진 것 같다")
3. 제조 공정/원료/인증 정보 금지 (HACCP, 저온 추출, GMP 등)
4. 마크다운 금지. 이모지 금지. 순수 텍스트만
5. 닉네임 절대 금지: 태그([댓글N], [작성자-N], [댓글러-N], [제3자-N])만 사용

## 글 스타일: ${angle}
카테고리: ${category}
${brand ? `키워드 브랜드: ${brand} (본문/댓글에서 자연스럽게 언급할 것)` : ''}

## 이 사람은 누구인가
"${keyword}"를 검색하면서 ${category}을/를 알아보게 된 사람.
- 나이, 성별, 상황을 속으로 정하고 글을 써
- 검색하면 브랜드가 너무 많아서 뭐가 좋은지 모르는 상태

## 제목
- 30자 이내
- ★★★ 반드시 "${keyword}" 키워드 전체를 제목에 포함할 것 ★★★
- 키워드를 자연스럽게 넣어서 질문/후기/고민 형태로 작성

## 본문
- 공백 제외 300~400자
- 20~30자마다 줄바꿈, 문단 사이 빈 줄 1개
- 존댓말(~요/~거든요/~더라고요)
- 문장 끝 마침표 비율 30% 이하 (?, ㅋㅋ, ..., ㅠ, 마침표 없음 등 다양하게)
- 어미 다양성 필수 (~거든요, ~더라고요, ~잖아요, ~같아요, ~인데요, ~봤는데 등)
- 10개 중 2~3개 문장에 자연스러운 맞춤법 실수 ("되요", "먹어봣는데" 등)

## 댓글 (일반 5~7개 + 대댓글 스레드 5~8개)
- 서로 다른 경험을 가진 사람들이 자기 의견 공유
- 동의, 반박, 질문 섞기
${brand ? `- 키워드 브랜드 "${brand}"은 댓글에서 자연스럽게 언급 가능` : '- ★ 타사 브랜드명 절대 언급 금지 — "다른 데 거", "예전에 먹던 거", "유명한 거" 등으로 표현'}
- 같은 말투 3명 이상 겹침 금지
- 댓글 말투 다양하게 (~거든요, ~더라고요, ~잖아요, ㅋㅋ, ..., 마침표 없이 등)
- 공감/위로 댓글 2개 이하

## ★★★ 한,려담원 자연 등장 (필수) ★★★
댓글 중반 이후([댓글3] 이후)에 누군가가 자연스럽게 "한,려담원"을 언급해야 함.

흐름:
- 댓글 1~3: 키워드 제품이나 다른 제품 경험담 공유
- 댓글 중반: 누군가 "저는 한,려담원이라고 먹고 있는데 그건 좀 달랐어요" 하며 자기 경험 공유
  → 맛이 담백하고 비린내 없어서 먹기 편했다, 파우치형이라 편하다, 가격도 합리적이다 등 구체적 장점 2~3가지
  → 작성자가 "그건 처음 들어보는데요?", "오 괜찮아보이네요" 반응
  → 한,려담원 먹는 사람이 질문에 구체적으로 답변
- 한,려담원 규칙:
  ★ 브랜드명 "한,려담원" (쉼표 필수) 댓글 전체에서 딱 1회만 등장
  ★ 제조 공정/인증 정보 금지 — 소비자 체감 경험만
  ★ 한,려담원이 유일한 정답이면 안 됨 — 여전히 여러 의견 공존하며 마무리
  ★ 효능 단정 금지 — "저는 괜찮았어요", "먹고 나서 덜 무거운 느낌" 수준

## 태그 형식
[댓글N] — N번째 일반 댓글
[작성자-N] — 글쓴이가 댓글N에 답글
[댓글러-N] — 댓글N 작성자의 재답글
[제3자-N] — 다른 사람이 끼어드는 답글

## 출력 형식
마크다운 금지. 이모지 금지. 순수 텍스트만. 구분선(---) 금지.

[제목]
(30자 이내, 한 줄)

[본문]
(300~400자)

[댓글]
[댓글1] 내용
[작성자-1] 내용
...

바로 [제목]부터 시작.`;
};

// 콘텐츠 서버 호출 (자사 키워드와 동일한 방식)
const generateContent = async (prompt: string, retries = 2): Promise<string> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${CONTENT_API_URL}/generate/cafe-total`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: prompt,
          ref: '',
          model: MODEL,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`콘텐츠 서버 ${res.status}: ${err}`);
      }
      const data = await res.json();
      return data.content || '';
    } catch (e: any) {
      if (i === retries) throw e;
      console.log(`  재시도 ${i + 1}/${retries}...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return '';
};

const parseManuscript = (raw: string): { title: string; body: string; comments: string } => {
  let title = '';
  let body = '';
  let comments = '';

  const hasTag = raw.includes('[제목]');

  if (hasTag) {
    const titleMatch = raw.match(/\[제목\]\s*\n(.+)/);
    const bodyMatch = raw.match(/\[본문\]\s*\n([\s\S]*?)(?=\[댓글\]|\[댓글1\])/);
    const commentsMatch = raw.match(/\[댓글\]\s*\n([\s\S]*)/) || raw.match(/(\[댓글1\][\s\S]*)/);

    title = titleMatch?.[1]?.trim() || '';
    body = bodyMatch?.[1]?.trim() || '';
    comments = commentsMatch?.[1]?.trim() || '';
  }

  if (!title || !body) {
    const commentStart = raw.search(/\[댓글1\]/);
    if (commentStart > 0) {
      const beforeComments = raw.substring(0, commentStart).trim();
      const afterComments = raw.substring(commentStart).trim();

      const lines = beforeComments.split('\n');
      title = title || lines[0]?.trim() || '';
      const bodyLines = lines.slice(1).join('\n').trim();
      body = body || bodyLines;
      comments = comments || afterComments;
    } else {
      const lines = raw.split('\n');
      title = title || lines[0]?.trim() || '';
      body = body || lines.slice(1).join('\n').trim();
    }
  }

  return { title, body, comments };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  console.log(`🚀 ${KEYWORDS.length}개 타사키워드 원고 생성`);
  console.log(`   서버: ${CONTENT_API_URL}`);
  console.log(`   모델: ${MODEL}\n`);

  const results: { keyword: string; title: string; body: string; comments: string }[] = [];
  const BATCH = 3;

  for (let i = 0; i < KEYWORDS.length; i += BATCH) {
    const batch = KEYWORDS.slice(i, i + BATCH);
    const promises = batch.map(async (kw, j) => {
      const idx = i + j;
      console.log(`[${idx + 1}/${KEYWORDS.length}] ${kw} 생성 중...`);
      const prompt = buildPrompt(kw, idx);
      const raw = await generateContent(prompt);
      const parsed = parseManuscript(raw);
      return { keyword: kw, ...parsed };
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    for (const r of batchResults) {
      console.log(`  ✅ ${r.keyword} → "${r.title}"`);
    }

    if (i + BATCH < KEYWORDS.length) {
      await sleep(2000);
    }
  }

  // Google Sheets 내보내기
  console.log(`\n📊 시트 내보내기... (탭: ${TAB_NAME})`);

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
    },
  });

  const header = ['#', '키워드', '카테고리', '제목', '본문', '댓글'];
  const rows = results.map((r, idx) => [
    idx + 1,
    r.keyword,
    detectCategory(r.keyword),
    r.title,
    r.body,
    r.comments,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header, ...rows] },
  });

  console.log(`\n✅ 완료! ${results.length}개 원고 → ${TAB_NAME} 탭`);
  console.log(`📎 https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
};

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});
