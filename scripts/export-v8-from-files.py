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

    # [제목] 태그가 있는 경우
    t = re.search(r'\[제목\]\s*\n?(.+?)(?=\n\n|\n\[본문\])', text, re.DOTALL)
    if t:
        title = t.group(1).strip()
    else:
        # 태그 없으면 첫 줄이 제목
        first_line = text.strip().split('\n')[0].strip()
        title = first_line

    # 댓글 위치 찾기 (여러 패턴)
    comment_start = -1
    for pattern in [r'\[댓글\]', r'\[댓글1\]', r'^\[댓글1\]']:
        m = re.search(pattern, text, re.MULTILINE)
        if m:
            comment_start = m.start()
            break

    # [본문] 태그가 있는 경우
    b = re.search(r'\[본문\]\s*\n(.+?)(?=\[댓글\]|\[댓글1\])', text, re.DOTALL)
    if b:
        body = b.group(1).strip()
    else:
        # 태그 없으면 첫줄(제목) 이후 ~ 댓글 시작 전까지가 본문
        lines = text.strip().split('\n')
        body_start = 1  # 첫줄은 제목
        # 빈 줄 건너뛰기
        while body_start < len(lines) and not lines[body_start].strip():
            body_start += 1
        if comment_start > 0:
            body_text = text[text.index('\n') + 1:comment_start]
        else:
            body_text = '\n'.join(lines[body_start:])
        body = body_text.strip()

    # 댓글
    comments = ""
    if comment_start >= 0:
        comment_text = text[comment_start:]
        # [댓글] 헤더 제거
        comment_text = re.sub(r'^\[댓글\]\s*\n?', '', comment_text)
        comments = comment_text.strip()

    return title, body, comments

descs = {
    "01_난임": "A형(사연먼저)+ㅠㅠ형+카페댓글경로",
    "02_기력보충": "E형(실패담)+ㅋㅋ형+엄마가들고옴",
    "03_산후조리": "D형(타임라인)+수다형+시어머니택배",
    "04_갱년기": "H형(대화재현)+담백형+한의원언급",
    "05_수족냉증": "F형(비교리뷰)+조심형+남편알아봄",
    "06_허약체질": "C형(Q&A)+ㅎㅎ형+동료추천",
    "07_면역력": "G형(일기체)+조심형+시누이추천",
    "08_보양식": "J형(논쟁정리)+ㅋㅋ형+할머니기억",
    "09_피로회복": "B형(수치먼저)+담백형+검색발견",
    "10_혈액순환": "I형(체크리스트)+ㅠㅠ형+홍삼대안",
}

files = sorted(glob.glob("manuscripts/v8/*.txt"))
rows = []

for path in files:
    fname = os.path.basename(path).replace(".txt", "")
    keyword = fname.split("_", 1)[1] if "_" in fname else fname
    desc = descs.get(fname, "")

    t, b, c = parse(path)
    body_len = len(b)
    comment_lines = [l for l in c.split("\n") if l.strip()] if c else []

    rows.append([
        "v8 원문", now, keyword, desc, "Codex검토중",
        "v8 퓨샷제거+말투6종+쪽지분산+10구조+50댓글",
        t, b, c,
        f"원문 {body_len}자. 댓글 {len(comment_lines)}줄.",
        "Codex검토중"
    ])
    print(f"✅ {keyword}: 제목={t[:30]}... 본문={body_len}자 댓글={len(comment_lines)}줄")

ws.append_rows(rows, value_input_option="RAW")
print(f"\n{len(rows)}개 원문 시트 추가 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
