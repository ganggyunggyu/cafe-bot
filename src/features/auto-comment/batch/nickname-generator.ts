// 랜덤 닉네임 생성기 (중복 방지)

// 형용사 목록
const ADJECTIVES = [
  '행복한', '즐거운', '귀여운', '멋진', '예쁜', '신나는', '따뜻한', '밝은',
  '상냥한', '활발한', '차분한', '용감한', '착한', '재미있는', '똑똑한', '성실한',
  '친절한', '명랑한', '씩씩한', '건강한', '당당한', '빛나는', '달콤한', '상쾌한',
  '푸른', '하얀', '검은', '붉은', '노란', '초록', '보라', '분홍',
  '졸린', '배고픈', '심심한', '바쁜', '한가한', '느긋한', '급한', '조용한',
  '시끄러운', '작은', '큰', '긴', '짧은', '높은', '낮은', '빠른', '느린',
];

// 명사 목록
const NOUNS = [
  '고양이', '강아지', '토끼', '다람쥐', '햄스터', '곰돌이', '펭귄', '부엉이',
  '여우', '판다', '코알라', '사자', '호랑이', '늑대', '독수리', '비둘기',
  '나비', '꿀벌', '무당벌레', '잠자리', '개구리', '거북이', '고슴도치', '두더지',
  '사과', '바나나', '딸기', '포도', '수박', '참외', '복숭아', '체리',
  '장미', '해바라기', '튤립', '백합', '벚꽃', '코스모스', '국화', '라벤더',
  '별', '달', '해', '구름', '바람', '비', '눈', '무지개',
  '하늘', '바다', '산', '숲', '들판', '강', '호수', '섬',
  '빵', '케이크', '쿠키', '초콜릿', '캔디', '아이스크림', '도넛', '마카롱',
];

// 숫자 접미사 (선택적)
const getRandomNumber = (): string => {
  const rand = Math.random();
  if (rand < 0.3) return ''; // 30% 확률로 숫자 없음
  if (rand < 0.6) return String(Math.floor(Math.random() * 100)); // 0-99
  return String(Math.floor(Math.random() * 1000)); // 0-999
};

// 이미 생성된 닉네임 추적 (중복 방지)
const usedNicknames = new Set<string>();

/**
 * 랜덤 닉네임 생성
 * @param maxLength 최대 길이 (기본: 20)
 * @returns 생성된 닉네임
 */
export const generateRandomNickname = (maxLength = 20): string => {
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const number = getRandomNumber();

    const nickname = `${adjective}${noun}${number}`;

    // 길이 체크 & 중복 체크
    if (nickname.length <= maxLength && !usedNicknames.has(nickname)) {
      usedNicknames.add(nickname);
      return nickname;
    }

    attempts++;
  }

  // 최대 시도 초과 시 타임스탬프로 유니크하게
  const fallback = `유저${Date.now()}`;
  usedNicknames.add(fallback);
  return fallback;
};

/**
 * 여러 개의 고유 닉네임 생성
 * @param count 생성할 개수
 * @param maxLength 최대 길이
 * @returns 닉네임 배열
 */
export const generateUniqueNicknames = (count: number, maxLength = 20): string[] => {
  const nicknames: string[] = [];

  for (let i = 0; i < count; i++) {
    nicknames.push(generateRandomNickname(maxLength));
  }

  return nicknames;
};

/**
 * 사용된 닉네임 초기화 (새 배치 시작 시 호출)
 */
export const resetUsedNicknames = (): void => {
  usedNicknames.clear();
};

/**
 * 현재 사용된 닉네임 개수
 */
export const getUsedNicknameCount = (): number => {
  return usedNicknames.size;
};
