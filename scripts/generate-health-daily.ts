/**
 * 건강 일상 키워드 원고 100개 생성 → Google Sheets 작성
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/generate-health-daily.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { google } from "googleapis";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";

const SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const CONCURRENCY = 3;

const HEALTH_KEYWORDS = [
  // 운동/피트니스 (15)
  "필라테스 초보 3개월 후기",
  "런닝크루 주3회 5km 도전기",
  "홈트레이닝 덤벨 루틴 추천",
  "수영 자유형 배우기 한달 후기",
  "아침 공원 걷기 30분 효과",
  "요가 스트레칭 허리 통증 완화",
  "계단 오르기 운동 한달 변화",
  "점심시간 사무실 스트레칭 루틴",
  "주말 등산 북한산 둘레길 초보 코스",
  "자전거 출퇴근 한달 후기",
  "새벽 러닝 습관 만들기",
  "스쿼트 100개 챌린지 2주차",
  "폼롤러 마사지 종아리 풀기",
  "플랭크 30일 챌린지 복근 변화",
  "배드민턴 동호회 가입 후기",

  // 식단/영양 (15)
  "혈당 스파이크 줄이는 식후 걷기",
  "오메가3 알티지 rTG 고르는 법",
  "아침 공복 레몬수 한달 효과",
  "프로바이오틱스 유산균 장건강 루틴",
  "단백질 쉐이크 옵티멈뉴트리션 후기",
  "abc주스 해독 한달 챌린지",
  "저탄고지 식단 일주일 도시락",
  "간헐적 단식 16:8 한달 솔직 후기",
  "비타민D 겨울철 필수 영양제",
  "콜라겐 파우더 피부 변화 3개월",
  "철분제 빈혈 개선 복용 후기",
  "마그네슘 눈떨림 해결 후기",
  "식이섬유 하루 권장량 채우는 법",
  "밀프렙 일주일 식단 준비 후기",
  "프로틴바 편의점 비교 솔직 리뷰",

  // 수면/휴식 (10)
  "멜라토닌 구미 수면질 개선 후기",
  "수면 루틴 만들기 밤 11시 취침",
  "아로마 디퓨저 라벤더 수면 효과",
  "수면 앱 추천 슬립사이클 vs 필로우",
  "주말 낮잠 30분 파워냅 효과",
  "블루라이트 차단 안경 수면 개선",
  "백색소음 빗소리 수면 음악 추천",
  "수면 무호흡 자가진단 체크리스트",
  "카페인 끊기 디카페인 전환 후기",
  "수면 베개 높이 조절 목 통증 해결",

  // 멘탈/마음건강 (10)
  "명상 앱 캄 vs 마보 비교 후기",
  "저널링 습관 감사일기 한달 효과",
  "번아웃 회복 디지털 디톡스 주말",
  "산책 명상 걸으면서 마음 정리",
  "스트레스 해소 취미 원예 시작",
  "월요병 극복 아침 루틴 만들기",
  "SNS 디톡스 인스타 삭제 일주일",
  "독서 모임 한달 4권 읽기 도전",
  "반신욕 입욕제 추천 스트레스 해소",
  "자기전 핸드폰 안보기 챌린지",

  // 피부/뷰티건강 (10)
  "선크림 SPF50 실내에서도 필수인 이유",
  "세라마이드 크림 건조 피부 보습 후기",
  "레티놀 입문 초보 피부장벽 회복기",
  "봄철 미세먼지 피부관리 클렌징 루틴",
  "비타민C 세럼 vs 먹는 비타민C 효과",
  "더마롤러 홈케어 모공 관리 후기",
  "아토피 보습 루틴 계절별 관리법",
  "자외선 차단 모자 선글라스 필수템",
  "피부과 레이저 토닝 3회차 후기",
  "세안 순서 이중세안 올바른 방법",

  // 생활습관/웰니스 (15)
  "사우나 루틴 주2회 회복 웰니스",
  "봄맞이 홈카페 디카페인 커피 머신",
  "공기청정기 다이슨 vs 삼성 비스포크",
  "정수기 직수형 vs 탱크형 비교",
  "체중계 매일 재기 vs 주1회 측정",
  "물 하루 2리터 마시기 챌린지",
  "발마사지 족욕 혈액순환 개선",
  "자세 교정 바른 의자 추천 후기",
  "미니멀 라이프 물건 줄이기 한달",
  "아침 기상 알람 없이 자연기상",
  "독소 제거 해독 주스 레시피 공유",
  "건강검진 30대 필수 항목 체크",
  "혈압 측정기 가정용 추천 비교",
  "근감소증 예방 일상 운동 팁",
  "봄철 알레르기 비염 관리 꿀팁",

  // 다이어트/체중관리 (10)
  "치팅데이 없이 다이어트 유지하는 법",
  "기초대사량 높이는 근력운동 루틴",
  "다이어트 정체기 극복 식단 변화",
  "눈바디 한달 기록 체형 변화 비교",
  "저녁 탄수화물 줄이기 2주 변화",
  "다이어트 도시락 닭가슴살 레시피",
  "체지방률 측정 인바디 vs 스마트체중계",
  "간식 대체 견과류 하루 한줌 효과",
  "걷기 다이어트 만보기 한달 후기",
  "야식 대신 허브차 마시기 습관",

  // 건강정보/질환 (15)
  "위산역류 생활습관 개선 방법",
  "VDT 증후군 눈 피로 사무직 관리",
  "손목 터널 증후군 예방 스트레칭",
  "목디스크 초기 증상 자가체크",
  "허리디스크 예방 코어 운동 3가지",
  "족저근막염 인솔 깔창 추천 후기",
  "편두통 원인 생활패턴 점검",
  "변비 해결 식이섬유 유산균 조합",
  "구내염 반복 면역력 관리법",
  "철결핍성 빈혈 증상 자가진단",
  "건조한 눈 인공눈물 올바른 사용법",
  "장염 회복 죽 레시피 추천",
  "대상포진 예방접종 30대 필요할까",
  "갑상선 기능 저하 피로감 체크",
  "고혈압 가족력 20대부터 관리법",
];

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const parseComments = (text: string): string => {
  const match = text.match(/\[댓글\]\s*\n?([\s\S]*?)$/);
  return match ? match[1].trim() : "";
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const generateArticle = async (
  keyword: string,
  index: number,
): Promise<{ keyword: string; title: string; body: string; comments: string }> => {
  const prompt = buildShortDailyPrompt({ keyword, keywordType: "own" });
  try {
    const { content } = await generateViralContent({ prompt });
    const title = parseTitle(content);
    const body = parseBody(content);
    const comments = parseComments(content);
    console.log(`[${index + 1}/100] ✅ "${keyword}" → "${title.slice(0, 30)}..."`);
    return { keyword, title, body, comments };
  } catch (e) {
    console.log(`[${index + 1}/100] ❌ "${keyword}" — ${e instanceof Error ? e.message : e}`);
    return { keyword, title: "ERROR", body: String(e), comments: "" };
  }
};

const runBatch = async <T>(
  items: T[],
  fn: (item: T, index: number) => Promise<any>,
  concurrency: number,
) => {
  const results: any[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
      await sleep(500);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
};

const writeToSheet = async (
  rows: string[][],
) => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // 시트 정보 가져오기
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const targetSheet = meta.data.sheets?.find((s) => s.properties?.sheetId === 1761974693);
  const sheetName = targetSheet?.properties?.title || "Sheet1";
  console.log(`시트 이름: "${sheetName}"`);

  // 헤더 + 데이터 작성
  const header = ["키워드", "제목", "본문", "댓글"];
  const values = [header, ...rows];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:D${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  console.log(`✅ ${rows.length}행 시트에 작성 완료`);
};

const main = async () => {
  console.log(`=== 건강 일상 원고 ${HEALTH_KEYWORDS.length}개 생성 시작 ===\n`);

  const articles = await runBatch(
    HEALTH_KEYWORDS,
    (kw, i) => generateArticle(kw, i),
    CONCURRENCY,
  );

  const successCount = articles.filter((a) => a.title !== "ERROR").length;
  console.log(`\n생성 완료: ${successCount}/${HEALTH_KEYWORDS.length}건\n`);

  const rows = articles.map((a) => [a.keyword, a.title, a.body, a.comments]);
  await writeToSheet(rows);
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
