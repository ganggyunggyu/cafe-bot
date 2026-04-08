import os, re, glob
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

files = [
    ("manuscripts/v4/기력보충_E형.txt", "기력보충", "E형(실패담)"),
    ("manuscripts/v4/수족냉증_F형.txt", "수족냉증", "F형(비교리뷰)"),
]

rows = []
for path, keyword, pattern in files:
    t, b, c = parse(path)
    rows.append(["v4 원문", now, keyword, pattern, "PASS", "v4 10구조+50댓글", t, b, c, "원문 전체", "PASS"])

ws.append_rows(rows, value_input_option="RAW")
print(f"{len(rows)}개 원문 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
