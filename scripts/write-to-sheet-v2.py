import os
import re
import gspread
from google.oauth2.service_account import Credentials

SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms"
TAB_NAME = "한려담원 원고 테스트"

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

try:
    ws = spreadsheet.worksheet(TAB_NAME)
except gspread.exceptions.WorksheetNotFound:
    ws = spreadsheet.add_worksheet(title=TAB_NAME, rows=100, cols=10)

# MD 파일 직접 파싱
md_path = os.path.join(os.path.dirname(__file__), "..", "batch-test-results.md")
with open(md_path, "r", encoding="utf-8") as f:
    md = f.read()

entries = re.split(r"^## \d+\.", md, flags=re.MULTILINE)[1:]

header = ["키워드", "카테고리", "원고유형", "제목", "본문", "댓글"]
rows = [header]

for entry in entries:
    # 헤더 파싱
    hm = re.match(r"\s*\[(.+?)\]\s*\[(.+?)\]\s*(.+)", entry)
    if not hm:
        continue
    category, angle_type, keyword = hm.group(1), hm.group(2), hm.group(3).strip()

    lines = entry.split("\n")

    # 제목
    title = ""
    title_idx = next((i for i, l in enumerate(lines) if l.strip() == "[제목]"), -1)
    body_idx = next((i for i, l in enumerate(lines) if l.strip() == "[본문]"), -1)
    comment_idx = next((i for i, l in enumerate(lines) if l.strip() == "[댓글]"), -1)

    if title_idx >= 0:
        end = body_idx if body_idx >= 0 else len(lines)
        title = " ".join(l.strip() for l in lines[title_idx+1:end] if l.strip())
    else:
        # [제목] 태그 없는 경우
        for i, l in enumerate(lines):
            if i > 0 and l.strip() and not l.startswith("[") and not l.startswith("#"):
                title = l.strip()
                break

    # 본문
    body = ""
    if body_idx >= 0:
        end = comment_idx if comment_idx >= 0 else len(lines)
        body = "\n".join(lines[body_idx+1:end]).strip()
    elif title_idx < 0:
        first_comment = next((i for i, l in enumerate(lines) if re.match(r"\[댓글\d+\]", l.strip())), len(lines))
        content_start = next((i for i, l in enumerate(lines) if i > 1 and l.strip() and not l.startswith("[") and not l.startswith("#")), -1)
        if content_start >= 0:
            body = "\n".join(lines[content_start+1:first_comment]).strip()

    # 댓글
    comments = ""
    if comment_idx >= 0:
        end = next((i for i, l in enumerate(lines) if i > comment_idx and l.strip() == "---"), len(lines))
        comments = "\n".join(lines[comment_idx+1:end]).strip()
    else:
        first_c = next((i for i, l in enumerate(lines) if re.match(r"\[댓글\d+\]", l.strip())), -1)
        if first_c >= 0:
            end = next((i for i, l in enumerate(lines) if i > first_c and l.strip() == "---"), len(lines))
            comments = "\n".join(lines[first_c:end]).strip()

    rows.append([keyword, category, angle_type, title, body, comments])

print(f"총 {len(rows)-1}개 원고 파싱 완료")

# 시트 클리어 후 쓰기
ws.clear()
ws.update(rows, value_input_option="RAW")

print(f"시트 업데이트 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={ws.id}")
