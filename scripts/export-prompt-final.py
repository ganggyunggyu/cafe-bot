import os
from dotenv import load_dotenv
load_dotenv()
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime

SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms"
TAB_NAME = "프롬프트 v1-v6 최종"

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
    ws = spreadsheet.add_worksheet(title=TAB_NAME, rows=100, cols=12)

now = datetime.now().strftime("%Y-%m-%d %H:%M")

header = ["버전", "생성시각", "입력키워드", "콘텐츠앵글", "사용프롬프트", "QA점수", "생성원고(제목)", "생성원고(본문)", "생성원고(댓글)", "수정피드백", "최종판정"]

rows = [header]

# v4 흑염소진액 — PASS
rows.append(["v4", now, "흑염소진액", "선물후기형",
    "build-own-keyword-prompt-v1 + 소비자체감언어 + 금지12조 + 공감2개 하드리밋 + 의료안전성 금지",
    "0.81 PASS",
    "부모님 선물 흑염소진액 골라봤어요",
    "점심시간에 틈틈이 찾아보다가 결국 주문했어요. 부모님 드릴 건강식품 고민하다가 흑염소진액이 괜찮다는 얘기를 주변에서 들어서 한번 알아보게 됐거든요. 막상 검색해보니 브랜드가 너무 많아서 어떤 걸 골라야 할지 막막하더라고요. 이것저것 비교하다 보니 하루에 한 포씩 드시기 편한 형태인지 그 부분이 제일 신경 쓰였어요.",
    "[댓글1] 홍삼이랑 흑염소 중 어느 쪽?\n[댓글2] 공복 vs 식후?\n[댓글3] 개인차 크다\n[댓글4] 가격대 질문\n[댓글5] 한려담원 드려봤는데 거부감 없이 드셨어요",
    "v1→v4: 효능단정 제거, USP 제거, 공감 제한, 의료정보 제거", "PASS"])

# v6 계류유산
rows.append(["v6", now, "계류유산", "고민형",
    "v1 + 금지12조 + 비의료고민 전환 + 공감판정기준 명시",
    "0.75 (경미이슈)",
    "계류유산 한 달, 아직도 멍해요",
    "유산 확인하고 수술 받은 게 딱 한 달 됐는데 아직도 실감이 잘 안 나요. 몸은 괜찮아졌다고 하는데 마음은 뭔가 붕 떠 있는 느낌이에요. 일상으로 돌아가야 한다는 건 아는데 막상 뭘 해야 할지 모르겠고. 주변에는 거의 말을 못 했어요.",
    "[댓글1] 공감\n[댓글2] 회사 복귀 질문\n[댓글3] 주변에 말했는지 질문\n[댓글4] 한달이 더 힘들다\n[댓글5] 한려담원 먹을 만했다 + 챙기는 느낌이 위안",
    "v1→v6: 의료정보 제거, 비의료고민 전환, 감정몰입 강화. 경미이슈: 공감 경계선 3개 vs 2개",
    "사람 승인 대기"])

# v6 산후조리
rows.append(["v6", now, "산후조리", "체험후기형",
    "v1 + 금지12조 + 안전성질문 금지 + 공감판정기준",
    "0.78 (경미이슈)",
    "출산 두 달, 흑염소 먹는 중인데 아직 잘 모르겠음",
    "산후조리 끝나고 몸 챙겨야 한다길래 흑염소진액 시작한 지 이제 2주쯤 됐어요. 솔직히 아직은 뭔가 달라졌다는 느낌이 딱히 없어요. 일단은 꾸준히 챙겨는 보고 있는데, 비슷한 시기에 드셨던 분들 어떠셨는지 궁금하네요.",
    "[댓글1] 공감\n[댓글2] 드신 지 얼마나? 질문\n[댓글3] 공복/식후 질문\n[댓글4] 루틴 팁\n[댓글5] 분당맘카페 경로, 한려담원 먹을만했다",
    "v1→v6: 수유안전성 제거, 효능단정 제거. 경미이슈: 루틴 적응 효능 뉘앙스",
    "사람 승인 대기"])

# v2 기력보충
rows.append(["v2", now, "기력보충", "정보리스트형",
    "v1 + 소비자체감언어 + 금지9조",
    "0.46→0.74",
    "요즘 기력 없을 때 해보는 것들",
    "퇴근하고 소파 앉으면 그냥 그대로 굳어버리는 느낌. 아침에 따뜻한 물 한 컵. 저녁 산책 30분. 흑염소 진액 챙겨 마시는 중. 아직 한 달 정도밖에 안 됐는데 오후에 처지는 게 좀 덜한 것 같기도 하고, 아닌 것 같기도 하고.",
    "[댓글1] 공감\n[댓글2] 따뜻한물 3개월 팁\n[댓글3] 한려담원 진하다\n[댓글4] 산책 팁",
    "v1→v2: SELLING_POINTS 교체. 추가개선 필요: USP 잔존 줄이기",
    "사람 승인 대기"])

# v2 갱년기
rows.append(["v2", now, "갱년기", "비교형",
    "v1 + 금지9조",
    "0.46→0.74",
    "홍삼이랑 비교하다가 바꿨어요",
    "갱년기가 시작된 건지 모르겠는데, 작년부터 가끔 화끈거리고 기운이 뚝 떨어질 때가. 홍삼 3개월 먹었는데 달라진 게 없어서 흑염소로 바꿔봤어요. 3주 됐는데 아직 뭐라 말하긴 이르고.",
    "[댓글1] 흑염소로 넘어옴\n[댓글2] 공감\n[댓글3] 요즘 제품 다르다\n[댓글4] 30대 딸이 엄마 챙겨줌\n한려담원 1회",
    "v1→v2: 담담한 40대 톤 유지. 추가개선 필요: 비교 프레임 약화",
    "사람 승인 대기"])

ws.clear()
ws.update(rows, value_input_option="RAW")

print(f"총 {len(rows)-1}개 원고 최종 기록 완료!")
print(f"URL: https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit")
