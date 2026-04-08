import os
from dotenv import load_dotenv
load_dotenv()
import gspread
from google.oauth2.service_account import Credentials

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

# 요약으로 들어간 행 찾아서 삭제 (본문 컬럼이 "5500자+" 또는 "5000자+"로 시작하는 행)
all_vals = ws.get_all_values()
rows_to_delete = []
for i, row in enumerate(all_vals):
    if i == 0:
        continue  # 헤더 건너뛰기
    # 본문(8번째 컬럼, index 7)이 "5500자+" 또는 "5000자+"로 시작하면 요약임
    if len(row) > 7 and (row[7].startswith("5500자+") or row[7].startswith("5000자+") or row[7].startswith("6000자+")):
        rows_to_delete.append(i + 1)  # 1-indexed

# 뒤에서부터 삭제 (인덱스 밀림 방지)
for row_num in sorted(rows_to_delete, reverse=True):
    ws.delete_rows(row_num)
    print(f"행 {row_num} 삭제 (요약)")

print(f"총 {len(rows_to_delete)}개 요약 행 삭제 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}#gid={GID}")
