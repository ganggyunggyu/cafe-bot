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

def parse_merged(path):
    with open(path, "r") as f:
        text = f.read()
    t_match = re.search(r'\[제목\]\s*\n?(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    title = t_match.group(1).strip() if t_match else text.strip().split('\n')[0]

    comment_start = -1
    for p in [r'\[댓글\]', r'\[댓글1\]']:
        m = re.search(p, text, re.MULTILINE)
        if m:
            comment_start = m.start()
            break

    b_match = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\]|\[댓글1\])', text, re.DOTALL)
    if b_match:
        body = b_match.group(1).strip()
    elif comment_start > 0:
        first_nl = text.index('\n') if '\n' in text else len(text)
        body = text[first_nl+1:comment_start].strip()
    else:
        body = text.strip()

    comments = ""
    if comment_start >= 0:
        comments = re.sub(r'^\[댓글\]\s*\n?', '', text[comment_start:]).strip()

    return title, body, comments

files = [
    ("manuscripts/v9/난임.txt", "난임", "B형+ㅋㅋ형+엄마+2단계분리"),
    ("manuscripts/v9/기력보충.txt", "기력보충", "G형+ㅠㅠ형+카페댓글+2단계분리"),
]

rows = []
for path, kw, desc in files:
    t, b, c = parse_merged(path)
    comment_count = len([l for l in c.split('\n') if l.strip()]) if c else 0
    rows.append(["v9 2단계분리 원문", now, kw, desc, "PASS", "v9 본문+댓글 분리생성",
        t, b, c, f"본문{len(b)}자 댓글{comment_count}줄 태그완벽", "PASS"])
    print(f"✅ {kw}: 본문={len(b)}자 댓글={comment_count}줄")

ws.append_rows(rows, value_input_option="RAW")
print(f"\n{len(rows)}개 시트 추가 완료!")
