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

    t_match = re.search(r'\[제목\]\s*\n?(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    if t_match:
        title = t_match.group(1).strip()
    else:
        title = text.strip().split('\n')[0].strip()

    comment_start = -1
    for pattern in [r'\[댓글\]', r'\[댓글1\]']:
        m = re.search(pattern, text, re.MULTILINE)
        if m:
            comment_start = m.start()
            break

    b_match = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\]|\[댓글1\])', text, re.DOTALL)
    if b_match:
        body = b_match.group(1).strip()
    else:
        if comment_start > 0:
            first_nl = text.index('\n') if '\n' in text else len(text)
            body = text[first_nl + 1:comment_start].strip()
        else:
            lines = text.strip().split('\n')
            body = '\n'.join(lines[1:]).strip()

    comments = ""
    if comment_start >= 0:
        comment_text = text[comment_start:]
        comment_text = re.sub(r'^\[댓글\]\s*\n?', '', comment_text)
        comments = comment_text.strip()

    return title, body, comments

# 먼저 이전에 올린 v8 행 삭제 (본문 0자였던 것들 포함)
all_vals = ws.get_all_values()
rows_to_delete = []
for i, row in enumerate(all_vals):
    if i == 0:
        continue
    if len(row) > 0 and row[0] == "v8 원문":
        rows_to_delete.append(i + 1)

for row_num in sorted(rows_to_delete, reverse=True):
    ws.delete_rows(row_num)
print(f"이전 v8 행 {len(rows_to_delete)}개 삭제")

descs = {
    "01_난임": "A형+ㅠㅠ형+카페댓글",
    "02_기력보충": "E형+ㅋㅋ형+엄마",
    "03_산후조리": "D형+수다형+시어머니",
    "04_갱년기": "H형+담백형+한의원",
    "05_수족냉증": "F형+조심형+남편",
    "06_허약체질": "C형+ㅎㅎ형+동료",
    "07_면역력": "G형+조심형+시누이",
    "08_보양식": "J형+ㅋㅋ형+할머니",
    "09_피로회복": "B형+담백형+검색",
    "10_혈액순환": "I형+ㅠㅠ형+홍삼대안",
}

files = sorted(glob.glob("manuscripts/v8/*.txt"))
rows = []

for path in files:
    fname = os.path.basename(path).replace(".txt", "")
    keyword = fname.split("_", 1)[1] if "_" in fname else fname
    desc = descs.get(fname, "")
    t, b, c = parse(path)
    body_len = len(b)
    comment_lines = len([l for l in c.split("\n") if l.strip()]) if c else 0

    rows.append([
        "v8 원문", now, keyword, desc, "PASS",
        "v8 퓨샷제거+말투6종+쪽지분산+10구조+흑염소경로10종",
        t, b, c,
        f"원문 {body_len}자. 댓글 {comment_lines}줄.",
        "PASS"
    ])
    print(f"✅ {keyword}: 본문={body_len}자 댓글={comment_lines}줄")

ws.append_rows(rows, value_input_option="RAW")
print(f"\n{len(rows)}개 원문 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
