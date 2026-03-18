import json
import os
import gspread
from google.oauth2.service_account import Credentials

SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms"
TAB_NAME = "한려담원 원고 테스트"

creds_info = {
    "type": "service_account",
    "project_id": "my-project-1759113027399",
    "private_key_id": "",
    "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace("\\n", "\n"),
    "client_email": os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL", ""),
    "client_id": "",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

creds = Credentials.from_service_account_info(creds_info, scopes=SCOPES)
gc = gspread.authorize(creds)

print(f"인증 성공: {creds_info['client_email']}")

spreadsheet = gc.open_by_key(SHEET_ID)
print(f"스프레드시트 열기 성공: {spreadsheet.title}")

try:
    worksheet = spreadsheet.worksheet(TAB_NAME)
    print(f"탭 '{TAB_NAME}' 찾음")
except gspread.exceptions.WorksheetNotFound:
    worksheet = spreadsheet.add_worksheet(title=TAB_NAME, rows=100, cols=10)
    print(f"탭 '{TAB_NAME}' 새로 생성")

# TSV 파일 읽기
tsv_path = os.path.join(os.path.dirname(__file__), "..", "batch-test-sheet.tsv")
with open(tsv_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

rows = []
for line in lines:
    cells = line.rstrip("\n").split("\t")
    # 큰따옴표 감싼 셀 처리
    cleaned = []
    for cell in cells:
        if cell.startswith('"') and cell.endswith('"'):
            cell = cell[1:-1].replace('""', '"')
        cleaned.append(cell)
    rows.append(cleaned)

print(f"\n데이터: {len(rows)}행 (헤더 포함)")

# 기존 데이터 클리어 후 쓰기
worksheet.clear()
worksheet.update(rows, value_input_option="RAW")

print(f"\n시트 업데이트 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={worksheet.id}")
