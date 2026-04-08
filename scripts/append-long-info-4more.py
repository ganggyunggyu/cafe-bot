import os
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
prompt = "build-long-info-prompt v2"

rows = [
    ["장문v2", now, "수족냉증", "장문 정보공유형", "PASS", prompt,
     "수족냉증 10년 겪고 내과, 한의원, 논문까지 뒤졌는데 이게 맞더라고요",
     "5500자+. 42세 여성. 여름에 에어컨 틀면 담요 쓰는 사연 → 하위권정상 진단 → 기초지식(말초혈관수축/자율신경/에스트로겐+혈관탄력) → 6가지 정보(족욕한계/홍삼방향차이/자율신경핵심/적외선체열검사/혈관영양/흑염소진액) → 비교표(운동/족욕/홍삼/흑염소/혈관영양제) → Before/After(손끝체온32.1→33.6도) → 사진3개 → 쪽지2레이어",
     "[댓글1]~[댓글12] 태그 정상. 정보감사3+질문2+쪽지1+경험3+공감1",
     "PASS. 전항목 충족. 날것톤 우수. 댓글 태그 정상.", "PASS"],

    ["장문v2", now, "면역력", "장문 정보공유형", "본문PASS 댓글FAIL", prompt,
     "올해만 세 번 아팠는데 알고 보니 제 면역력이 진짜 바닥이었더라고요",
     "5500자+. 35세 여성+3살아이. 장염때 혼자 아이보며 화장실 왔다갔다 → 기초(NK세포/장내미생물/수면-면역) → 6가지 정보(NK활성/비타민D/장미생물/아연/코르티솔/흑염소홍삼) → 비교표(유산균/비타민C/아연/홍삼/흑염소) → Before/After(WBC4.1→5.8/림프구22→31%/비타민D14.2→28.6/페리틴9.4→18.2) → 쪽지2레이어",
     "⚠️ 댓글이 #해시태그로 출력됨. 이모지(📷♡) 포함. 재생성 필요.",
     "본문 PASS. 댓글 포맷 FAIL → 프롬프트 댓글규칙 강화 필요", "재생성"],

    ["장문v2", now, "허약체질", "장문 정보공유형", "본문PASS 댓글FAIL", prompt,
     "허약체질 29살 남자인데요 트레이너한테 아무것도 없네요 들으면 진짜 무너지더라고요",
     "5500자+. 29세 남성 170/52kg. PT첫날 충격 사연 → 기초(기초대사량/흡수율/근손실사이클) → 6가지(코르티솔/비타민B/아연/장건강/간기능/철분) → 비교표(웨이/종합비타민/홍삼/흑염소/한약) → Before/After(체중52→57.8/골격근18.3→22.7/ALT38→22) → 쪽지2레이어",
     "⚠️ 댓글이 @닉네임으로 출력됨. ♡ 이모지 포함. 재생성 필요.",
     "본문 PASS (20대남성 톤 우수). 댓글 포맷 FAIL", "재생성"],

    ["장문v2", now, "보양식", "장문 정보공유형", "본문PASS 댓글FAIL", prompt,
     "자궁근종 수술 후 체력이 완전히 바닥났을 때 보양식 4가지 다 써보고 정리한 회복 기록",
     "5500자+. 44세 여성 자궁근종수술후. 계단1층에서 숨참 → 기초(수술후 단백질필요량/알부민/흡수율) → 6가지(소화부담/동식물성단백질/헴철흡수율/한약역할/홍삼타이밍/흑염소) → 비교표(삼계탕/한약/홍삼/흑염소/단백질쉐이크) → Before/After(알부민3.4→4.0/헤모글로빈9.8→12.3/체중54.5→56.8) → 쪽지2레이어",
     "⚠️ 댓글이 #해시태그로 출력됨. ♡ 이모지. 재생성 필요.",
     "본문 PASS (40대 톤 적절). 댓글 포맷 FAIL", "재생성"],
]

ws.append_rows(rows, value_input_option="RAW")
print(f"4개 원고 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
