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
prompt = "build-long-info-prompt v2 (원문)"

files = [
    ("수족냉증", "PASS"),
    ("면역력", "댓글포맷이슈(해시태그→재생성필요)"),
    ("허약체질", "댓글포맷이슈(@닉네임→재생성필요)"),
    ("보양식", "댓글포맷이슈(해시태그→재생성필요)"),
]

rows = []
for keyword, status in files:
    path = f"manuscripts/{keyword}.txt"
    with open(path, "r") as f:
        full = f.read()

    # 파싱: [제목] / [본문] / [댓글]
    title_match = re.search(r'\[제목\]\s*\n(.+?)(?=\n\n|\n\[본문\])', full, re.DOTALL)
    title = title_match.group(1).strip() if title_match else ""

    body_match = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\])', full, re.DOTALL)
    body = body_match.group(1).strip() if body_match else ""

    comment_match = re.search(r'\[댓글\]\s*\n(.+)', full, re.DOTALL)
    comments = comment_match.group(1).strip() if comment_match else ""

    is_pass = "PASS" if status == "PASS" else status
    rows.append(["장문v2 원문", now, keyword, "장문 정보공유형", is_pass, prompt,
        title, body, comments, f"본문PASS. {status}", is_pass])

ws.append_rows(rows, value_input_option="RAW")
print(f"{len(rows)}개 원문 시트에 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
