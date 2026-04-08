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
    # 제목
    t = re.search(r'\[제목\]\s*\n?(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    title = t.group(1).strip() if t else ""
    # 본문
    b = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\])', text, re.DOTALL)
    body = b.group(1).strip() if b else ""
    # 댓글
    c = re.search(r'\[댓글\]\s*\n(.+)', text, re.DOTALL)
    comments = c.group(1).strip() if c else ""
    return title, body, comments

files = [
    ("manuscripts/v7/산후조리.txt", "산후조리", "D형(타임라인)+ㅠㅠ형+시어머니"),
    ("manuscripts/v7/수족냉증.txt", "수족냉증", "J형(논쟁정리)+담백형+남편"),
    ("manuscripts/v7/허약체질.txt", "허약체질", "B형(수치먼저)+ㅋㅋ형+할머니"),
]

rows = []
for path, keyword, desc in files:
    if not os.path.exists(path):
        print(f"⚠️ {path} 없음")
        continue
    t, b, c = parse(path)
    char_count = len(b)
    comment_count = b.count("[댓글") + c.count("[댓글")
    rows.append([
        "v7 원문", now, keyword, desc, "PASS",
        "v7 퓨샷제거+말투다양성+파일직접저장",
        t, b, c,
        f"원문 {char_count}자. 댓글 파일에서 직접 로드.",
        "PASS"
    ])
    print(f"✅ {keyword}: 제목={t[:30]}... 본문={char_count}자")

ws.append_rows(rows, value_input_option="RAW")
print(f"\n{len(rows)}개 원문 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
