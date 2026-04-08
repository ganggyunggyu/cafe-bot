import os, re, glob
from dotenv import load_dotenv
load_dotenv()
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime

SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms"
GID = 914355730
batch_dir = "manuscripts/competitor-batch2-results"

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

if not ws:
    print(f"GID {GID} 시트를 찾을 수 없음")
    exit(1)

now = datetime.now().strftime("%Y-%m-%d %H:%M")

KEYWORDS = [
    '흑염소탕효능', '기력없을때', '기력회복한약', '보양식 추천',
    '웰스앤헬스 흑염소', '흑염소 한마리', '흑염소진액효능',
    '혈액순환', '면역력높이는방법', '산후 음식 기력 회복'
]

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

files = sorted(glob.glob(f"{batch_dir}/manuscript-*.txt"))
rows = []

for i, path in enumerate(files):
    kw = KEYWORDS[i] if i < len(KEYWORDS) else f"keyword-{i+1}"
    t, b, c = parse(path)
    cl = len([l for l in c.split('\n') if l.strip()]) if c else 0
    rows.append(["타사키워드2", now, kw, "competitor", "PASS",
        "타사비교+논쟁댓글", t, b, c,
        f"본문{len(b)}자 댓글{cl}줄", "PASS"])
    print(f"✅ {i+1}. {kw}: 제목={t[:20]}... 본문={len(b)}자 댓글={cl}줄")

ws.append_rows(rows, value_input_option="RAW")
print(f"\n🎉 {len(rows)}개 원고 시트 추가 완료! (타사키워드 배치2)")
