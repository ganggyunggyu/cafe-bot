import os, re
from dotenv import load_dotenv
load_dotenv()
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime

SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms"
GID = 1485226539

creds_info = {
    "type": "service_account",
    "project_id": "my-project-1759113027399",
    "private_key": os.environ["GOOGLE_PRIVATE_KEY"].replace("\\n", "\n"),
    "client_email": os.environ["GOOGLE_SERVICE_ACCOUNT_EMAIL"],
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}

creds = Credentials.from_service_account_info(creds_info, scopes=[
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
])
gc = gspread.authorize(creds)
spreadsheet = gc.open_by_key(SHEET_ID)

ws = None
for sheet in spreadsheet.worksheets():
    if sheet.id == GID:
        ws = sheet
        break

now = datetime.now().strftime("%Y-%m-%d %H:%M")
prompt = "build-long-info-prompt v4 (10구조+30~50댓글+AI사진)"

rows = [
    # 난임 A형 PASS — 본문은 너무 길어서 요약+핵심부분
    ["v4 A형 PASS", now, "난임", "장문(A형:사연먼저)", "PASS", prompt,
     "시험관 2차 실패하고 주차장에서 한시간 넘게 차에만 있었어요 (난임 4년차 36세 기록)",
     "5500자+ 원문. A형 구조: 긴사연(주차장침묵/엄마통화/멍한며칠)→정보6개(CoQ10/엽산/비타민D/오메가3/아르기닌/남편챙기기)→비교표(1차전vs3차준비)→수치(정자활력38→61%/AMH1.1→1.4)→쪽지2레이어→하트. 감정폭발: 주차장 장면, 엄마통화 장면.",
     "댓글 48개. [댓글N]/[작성자-N]/[댓글러-N]/[제3자-N] 태그 정상. 감사+질문+쪽지+의심+사연+유머+인용+가족대신+북마크+재답+제3자 전부 포함. 작성자답글 12개.",
     "PASS. 구조(A형) 차별화. 댓글48개 태그정상. 다양성 최고.", "PASS"],

    # 기력보충 E형 — 본문PASS
    ["v4 E형", now, "기력보충", "장문(E형:실패담)", "본문PASS 댓글FAIL", prompt,
     "기력보충 한다고 별걸 다 해봤는데 진짜 안 됐던 것들 먼저 얘기할게요",
     "5500자+. E형 구조: 실패1(홍삼3개월=체감없음)→실패2(철분제=변비)→실패3(운동=더지침)→병원가서 수치확인→페리틴12/비타민D16→6개월 보충→수치변화(페리틴41/비타민D38). 감정: '엄마 놀아줘'에 몸이 안 움직임.",
     "⚠️ 댓글이 @닉네임으로 출력. 재생성 필요.",
     "본문 PASS(E형 실패담 구조 우수). 댓글 태그 FAIL.", "재생성"],

    # 수족냉증 F형
    ["v4 F형", now, "수족냉증", "장문(F형:비교리뷰)", "본문PASS 댓글FAIL", prompt,
     "수족냉증 있는 분들 다 모여요 — 1년 동안 써본 것들 전부 비교해드립니다",
     "6000자+. F형 구조: 비교표 먼저(반신욕/생강차/핫팩/쑥뜸/마사지기/슬리퍼/한의원/당귀/족욕/영양제 10종!)→각 항목 상세리뷰→사연(야유회 담요)→수치(손끝32.1→33.6도). 10종 비교 압도적.",
     "⚠️ 댓글이 #해시태그로 출력. 재생성 필요.",
     "본문 PASS(F형 10종 비교 매우 우수). 댓글 FAIL.", "재생성"],

    # 면역력 G형
    ["v4 G형", now, "면역력", "장문(G형:일기체)", "본문PASS 댓글FAIL", prompt,
     "면역력 진짜 바닥이었던 우리 모자(母子) 3개월 기록",
     "5500자+. G형 구조: 1월(첫감기)→2월(장염/화장실왔다갔다/나도주사맞고싶다)→3월(공부시작/수치확인)→비교표(비타민D/아연/비타민C/베타글루칸/유산균/비타민B)→수치(WBC4.1→6.8/비타민D12→44). 일기체 감성+정보 자연스럽게 융합.",
     "⚠️ 댓글이 #해시태그로 출력. 이모지(😊) 포함. 재생성 필요.",
     "본문 PASS(G형 일기체 구조+감성 최고). 댓글 FAIL.", "재생성"],

    # 갱년기 H형
    ["v4 H형", now, "갱년기", "장문(H형:대화재현)", "본문PASS 댓글FAIL", prompt,
     "선생님이 '홍삼 방향이 좀 다릅니다' 하셨을 때 뭔 말인지 이제야 알겠어요",
     "5500자+. H형 구조: 선생님 대화 5~6회 재현(나:/선생님: 형태)→대화 속에서 자연스럽게 정보 전달→수치(FSH54→41/E2 18→38)→홍삼→다른접근 비교→수면/걷기/단백질 루틴. 대화 재현 형태가 정보 전달에 매우 효과적.",
     "⚠️ 댓글이 @닉네임으로 출력. 재생성 필요.",
     "본문 PASS(H형 대화재현 구조 가장 독특하고 자연스러움). 댓글 FAIL.", "재생성"],
]

ws.append_rows(rows, value_input_option="RAW")
print(f"v4 5개 원고 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
