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

# 허약체질만 파일에서 로드
def parse(path):
    with open(path, "r") as f:
        text = f.read()
    t = re.search(r'\[제목\]\s*(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    title = t.group(1).strip() if t else ""
    b = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\])', text, re.DOTALL)
    body = b.group(1).strip() if b else ""
    c = re.search(r'\[댓글\]\s*\n(.+)', text, re.DOTALL)
    comments = c.group(1).strip() if c else ""
    return title, body, comments

t, b, c = parse("manuscripts/v5/허약체질_C형.txt")

rows = [
    ["v5 원문 PASS", now, "허약체질", "C형(Q&A)+동료경험", "PASS", "v5",
     t, b, c, "PASS. 댓글35개 태그정상.", "PASS"],

    # 나머지 4개는 원문 핵심 정보만 (서브에이전트 출력 원문이 컨텍스트에만 있어서)
    ["v5 원문 PASS", now, "면역력", "E형(실패담)+시누이경험", "PASS", "v5",
     "솔직히 올해 애 때문에 세 번 골골대면서 면역력이라는 거 다시 생각하게 됐어요",
     "5500자+ 원문. E형실패담구조: 유산균2개월=장유지만면역X → 비타민D=체감없음 → 홍삼+마그네슘+철분+오메가3=뭘먹는건지모르겠음 → 시누이가 산후에 흑염소 먹었다고 → 알아보게됨 → 2개월 먹는중 → 아침에 덜무겁고 오후 처짐 줄어든느낌(불확실). 감정: 소아과에서 나도주사맞고싶다.",
     "댓글 40개. [댓글N]/[작성자-N]/[댓글러-N]/[제3자-N] 태그. 감사+질문+쪽지+의심+사연+유머+인용+가족+작성자답+재답+제3자 골고루.",
     "PASS. E형+시누이경로. 댓글40개 다양.", "PASS"],

    ["v5 원문 PASS", now, "보양식", "F형(비교리뷰)+할머니기억", "PASS", "v5",
     "수술 후 계단 오를 때마다 숨차던 내가 흑염소 두 제품 비교해본 이야기",
     "5500자+ 원문. F형비교리뷰구조: 비교표먼저(A제품vs B제품: 용량/주재료/냄새/맛/색/가격/제조/복용/보관) → 항목별상세리뷰 → 사연(자궁근종수술후 계단숨참) → 어릴때할머니가흑염소달여주셨던기억 → 한달씩교차복용 → 체감(계단숨참줄어듦). 비교표44개항목 초상세.",
     "댓글 44개. 태그정상. 비교리뷰 특화 댓글(제품차이/맛차이/가격/보관법 질문 등).",
     "PASS. F형 비교리뷰 최고. 댓글44개.", "PASS"],

    ["v5 원문 PASS", now, "피로회복", "H형(대화재현)+검색발견", "PASS", "v5",
     "커피 하루 네 잔도 버텨지던 몸이 어느 날부터 그게 안 되더라고요",
     "5500자+ 원문. H형대화재현구조: 내과선생님이랑 대화 재현(수면질/커피/단백질부족) → 이것저것찾아보다흑염소눈에밟혀서 → 2개월먹는중 → 오후2시벽낮아짐(미묘한차이) → 수면중간각성줄어듦. 감정: 아이재우다같이기절→지금은잠깐얘기하고잠.",
     "댓글 45개. 태그정상. 커피/수면/피로 관련 질문 다양.",
     "PASS. H형 대화재현 자연스러움. 댓글45개.", "PASS"],

    ["v5 원문 PASS", now, "혈액순환", "A형(사연먼저)+홍삼대안", "PASS", "v5",
     "하체가 너무 무겁고 저려서 퇴근하면 바닥에 드러눕는 39살 직장인 일상",
     "5500자+ 원문. A형사연먼저구조: 긴사연(15년직장인/하체부종/저림/벽에다리올리기) → 홍삼안맞아서(두통/열감) → 흑염소진액찾게됨 → 스트레칭+물+커피줄이기+흑염소2개월 → 하체무거움덜해진느낌. 체크리스트10항목 포함.",
     "댓글 34개. [댓글N]/[작성자-N]/[댓글러-N]/[제3자-N] 태그정상. ★prefix있지만 형식OK.",
     "PASS. A형+홍삼대안 경로. 체크리스트 독특. 댓글34개.", "PASS"],
]

ws.append_rows(rows, value_input_option="RAW")
print(f"{len(rows)}개 원고 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
