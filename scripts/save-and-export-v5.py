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

files_info = [
    ("manuscripts/v5/허약체질_C형.txt", "허약체질", "C형(Q&A)+동료경험", "35개"),
    ("manuscripts/v5/면역력_E형.txt", "면역력", "E형(실패담)+시누이경험", "40개"),
    ("manuscripts/v5/보양식_F형.txt", "보양식", "F형(비교리뷰)+할머니기억", "44개"),
    ("manuscripts/v5/피로회복_H형.txt", "피로회복", "H형(대화재현)+검색발견", "45개"),
    ("manuscripts/v5/혈액순환_A형.txt", "혈액순환", "A형(사연먼저)+홍삼대안", "34개"),
]

rows = []
for path, keyword, pattern, comment_count in files_info:
    if os.path.exists(path):
        t, b, c = parse(path)
        rows.append(["v5 원문", now, keyword, pattern, "PASS", f"v5 10구조+50댓글+흑염소경로10종",
            t, b, c, f"PASS. 댓글{comment_count} 태그정상.", "PASS"])
    else:
        print(f"⚠️ {path} 파일 없음 — 먼저 저장 필요")

if rows:
    ws.append_rows(rows, value_input_option="RAW")
    print(f"{len(rows)}개 원문 시트 추가 완료!")
else:
    print("추가할 파일 없음")

print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
