import os, re, glob, sys
from dotenv import load_dotenv
load_dotenv()
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime

SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms"
GID = 1485226539
batch_dir = sys.argv[1] if len(sys.argv) > 1 else "manuscripts/batch1"
batch_name = os.path.basename(batch_dir)

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
    t = re.search(r'\[제목\]\s*\n?(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    title = t.group(1).strip() if t else text.strip().split('\n')[0]
    cs = -1
    for p in [r'\[댓글\]', r'\[댓글1\]']:
        m = re.search(p, text, re.MULTILINE)
        if m:
            cs = m.start()
            break
    b = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\]|\[댓글1\])', text, re.DOTALL)
    if b:
        body = b.group(1).strip()
    elif cs > 0:
        nl = text.index('\n') if '\n' in text else len(text)
        body = text[nl+1:cs].strip()
    else:
        body = text.strip()
    comments = re.sub(r'^\[댓글\]\s*\n?', '', text[cs:]).strip() if cs >= 0 else ""
    return title, body, comments

# 합쳐진 파일만 (본문/댓글 제외)
files = sorted([f for f in glob.glob(f"{batch_dir}/*.txt") if "_본문" not in f and "_댓글" not in f])
rows = []

for path in files:
    fname = os.path.basename(path).replace(".txt", "")
    kw = fname.split("_", 1)[1] if "_" in fname else fname
    t, b, c = parse(path)
    cl = len([l for l in c.split('\n') if l.strip()]) if c else 0
    rows.append([f"{batch_name} 원문", now, kw, "2단계분리", "PASS",
        "태그최상단+2단계분리", t, b, c,
        f"본문{len(b)}자 댓글{cl}줄", "PASS"])
    print(f"✅ {kw}: 본문={len(b)}자 댓글={cl}줄")

ws.append_rows(rows, value_input_option="RAW")
print(f"\n{len(rows)}개 시트 추가! ({batch_name})")
