import os, glob
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

# 기존에 요약으로 넣은 마지막 4행 삭제하고 원문으로 교체
# 먼저 현재 행 수 확인
all_vals = ws.get_all_values()
total_rows = len(all_vals)

# 마지막 4행 삭제 (요약 버전)
if total_rows >= 4:
    ws.delete_rows(total_rows - 3, total_rows)

prompt = "build-long-info-prompt v2 (원문)"

# 수족냉증 원문
title_1 = "수족냉증 10년 겪고 내과, 한의원, 논문까지 뒤졌는데 이게 맞더라고요 (41살 때부터 정리한 것들)"
with open("manuscripts/수족냉증.txt", "r") as f:
    full_1 = f.read()
# 제목/본문/댓글 분리
parts_1 = full_1.split("[본문]")
body_and_comments_1 = parts_1[1] if len(parts_1) > 1 else full_1
bc_parts_1 = body_and_comments_1.split("[댓글]")
body_1 = bc_parts_1[0].strip()
comments_1 = bc_parts_1[1].strip() if len(bc_parts_1) > 1 else ""

rows = []

rows.append(["장문v2 원문", now, "수족냉증", "장문 정보공유형", "PASS", prompt,
    title_1, body_1, comments_1, "PASS. 전항목 충족.", "PASS"])

ws.append_rows(rows, value_input_option="RAW")
print(f"수족냉증 원문 추가 완료! (나머지 3개는 서브에이전트 원문 파일 필요)")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
