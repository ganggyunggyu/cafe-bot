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
prompt = "build-long-info-prompt v2 (화자카드+기능슬롯+리듬규칙+마이크로문체+비교표+쪽지2레이어+사진3개+제목슬롯+댓글포함)"

rows = [
    ["장문v2", now, "산후조리", "장문 정보공유형", "PASS (태그 미세이슈)", prompt,
     "첫째 때 탈모+손목 2년 고생하고 둘째는 제대로 챙기려고 알아본 산후조리 혈액수치 이야기",
     "5500자+ 장문. 첫째 산후조리 실패 사연(탈모1년, 손목관절) → 산부인과+한의원 6가지 정보(산후빈혈/탈모-페리틴/철분한계/수유보충제/페리틴vs헤모글로빈/100일조리) → 비교표(홍삼/한약/흑염소/철분제) → Before/After(헤모글로빈9.8→12.2, 페리틴11→38, 헤마토크릿29.4→36.1) → 사진3개 → 쪽지2레이어",
     "댓글 10개: 정보감사3 + 질문3 + 쪽지요청2 + 의심1 + 공감1. 태그 미세이슈(하이픈 리스트)",
     "PASS. 감정폭발+수치+비교표+날것톤 OK. 댓글 태그 형식 미세 이슈만", "PASS"],

    ["장문v2", now, "갱년기", "장문 정보공유형", "PASS", prompt,
     "갱년기 시작하고 나서 산부인과 5번 다녀온 기록 남겨요 (호르몬 수치 포함)",
     "5500자+ 장문. 51세 화끈거림/회의중 땀 에피소드 → FSH/E2 수치 공개 → 6가지 정보(증상기간/HRT/운동/이소플라본/수면/체중분포) → 비교표(HRT/홍삼/흑염소/운동) → Before/After(FSH 54.2→41.7, E2 18→38) → 사진3개 → 쪽지2레이어",
     "댓글 12개: [댓글1]~[댓글12] 태그 정상. 정보감사3 + 질문3 + 쪽지2 + 경험2 + 의심1 + 공감1",
     "PASS. 전항목 충족. 40~50대 톤 유지. 댓글 태그 정상.", "PASS"],

    ["장문v2", now, "기력보충", "장문 정보공유형", "PASS", prompt,
     "퇴근하면 소파에서 굳어버리는 38살 워킹맘, 페리틴 경계선 받고 6개월 기록 (기력보충)",
     "6000자+ 장문. 38세 워킹맘 감정폭발('엄마놀아줘'에 몸이 안 일어남) → 페리틴12경계선 → 6가지 정보(저장철/월경철분/비타민D/B12/전통보양/위장흡수) → 비교표(철분제/비타민B/홍삼/흑염소) → Before/After(페리틴12→41, 비타민D16→38, 헤모글로빈12.1→13.2) → 사진3개 → 쪽지2레이어",
     "댓글 8개 + 대댓글 3개. [댓글N]/[작성자-N]/[댓글러-1]/[제3자-1] 태그 사용. 의심댓글 '팔려는거 아닌가→없네요' 포함",
     "PASS. 감정몰입 최고(소파에서 굳어버림). 의심→해소 댓글 자연스러움.", "PASS"],
]

ws.append_rows(rows, value_input_option="RAW")

print(f"장문 v2 원고 3개 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
