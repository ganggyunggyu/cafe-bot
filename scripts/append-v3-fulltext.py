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
prompt = "build-long-info-prompt v3 (구조변주ABCD+댓글15~25+사진AI가능+다양성댓글유형)"

def parse_manuscript(text):
    title = ""
    body = ""
    comments = ""

    t = re.search(r'\[제목\]\s*\n(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    if t:
        title = t.group(1).strip()

    b = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\])', text, re.DOTALL)
    if b:
        body = b.group(1).strip()
    else:
        # 본문 태그 없이 제목 다음에 바로 시작하는 경우
        parts = text.split('[댓글]')
        if len(parts) > 1:
            body_part = parts[0]
            # 제목 제거
            body_part = re.sub(r'\[제목\].*?\n', '', body_part, count=1)
            body = body_part.strip()

    c = re.search(r'\[댓글\]\s*\n(.+)', text, re.DOTALL)
    if c:
        comments = c.group(1).strip()

    return title, body, comments

# 면역력 B형
text1 = open("manuscripts/면역력.txt").read()
t1, b1, c1 = parse_manuscript(text1)

# 허약체질 C형
text2 = open("manuscripts/허약체질.txt").read()
t2, b2, c2 = parse_manuscript(text2)

# 보양식 D형
text3 = open("manuscripts/보양식.txt").read()
t3, b3, c3 = parse_manuscript(text3)

rows = [
    ["장문v3 B형 원문", now, "면역력", "장문 정보(B형:수치먼저)", "PASS(태그미세이슈)", prompt,
     "올해만 세 번 쓰러진 35살 엄마가 면역력 수치 바꾸고 나서 달라진 것들",
     b1[:50000], c1[:50000],
     "B형구조(수치→사연→정보) OK. 댓글20개+다양. 태그형식 미세이슈(번호만).", "PASS"],

    ["장문v3 C형 원문", now, "허약체질", "장문 정보(C형:Q&A)", "PASS", prompt,
     "허약체질 6개월 지낸 29살 남자가 받은 질문들 다 답해드림",
     b2[:50000], c2[:50000],
     "C형구조(Q&A) OK. 댓글23개+다양(유머/가족/의심). 20대남성톤 우수.", "PASS"],

    ["장문v3 D형 원문", now, "보양식", "장문 정보(D형:타임라인)", "PASS", prompt,
     "자궁근종 수술 후 3개월, 보양식으로 버텼던 기록 남겨요",
     b3[:50000], c3[:50000],
     "D형구조(타임라인:직후→2주→1월→2월→3월) OK. 댓글20개+다양. 사진AI가능.", "PASS"],
]

ws.append_rows(rows, value_input_option="RAW")
print(f"v3 원문 3개 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
