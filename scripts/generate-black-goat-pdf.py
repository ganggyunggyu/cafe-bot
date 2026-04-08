#!/usr/bin/env python3
"""흑염소 진액 종합 보고서 PDF 생성 - v2 Pro Edition"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, black, white, Color
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, Flowable
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle
from reportlab.graphics import renderPDF
import os

# ── 폰트 등록 ──
FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
pdfmetrics.registerFont(TTFont("KR", FONT_PATH))

# ── 색상 시스템 (Deep Forest + Gold) ──
C = {
    "primary":    HexColor("#1B2838"),   # 딥 다크 블루
    "secondary":  HexColor("#2C5F2D"),   # 포레스트 그린
    "accent":     HexColor("#B8860B"),   # 다크 골드
    "accent2":    HexColor("#8B4513"),   # 새들 브라운
    "bg_dark":    HexColor("#1B2838"),
    "bg_medium":  HexColor("#2C3E50"),
    "bg_light":   HexColor("#F7F5F0"),   # 크림
    "bg_card":    HexColor("#FEFCF6"),   # 따뜻한 화이트
    "text":       HexColor("#2C2C2C"),
    "text_light": HexColor("#6B6B6B"),
    "text_muted": HexColor("#999999"),
    "border":     HexColor("#E8E2D6"),
    "tbl_head":   HexColor("#2C5F2D"),
    "tbl_alt":    HexColor("#F5F1EA"),
    "highlight":  HexColor("#FFF8E7"),   # 연한 골드
    "red":        HexColor("#C0392B"),
    "white":      white,
}

W, H = A4
OUTPUT = os.path.expanduser("~/Desktop/흑염소_진액_종합_보고서.pdf")

# ══════════════════════════════════════════════
# 커스텀 Flowable: 컬러 박스, 사이드바 인용, 키 인사이트
# ══════════════════════════════════════════════

class ColorBox(Flowable):
    """배경색이 있는 박스 안에 텍스트를 넣는 Flowable"""
    def __init__(self, text, bg_color, text_color, width, font_size=9, padding=8, border_color=None, border_left=0):
        super().__init__()
        self.text = text
        self.bg_color = bg_color
        self.text_color = text_color
        self.box_width = width
        self.font_size = font_size
        self.padding = padding
        self.border_color = border_color
        self.border_left = border_left
        style = ParagraphStyle("cb", fontName="KR", fontSize=font_size,
                               leading=font_size * 1.6, textColor=text_color,
                               alignment=TA_LEFT)
        self.para = Paragraph(text, style)
        pw = width - 2 * padding - border_left
        _, self.para_h = self.para.wrap(pw, 9999)
        self.box_height = self.para_h + 2 * padding

    def wrap(self, aw, ah):
        return self.box_width, self.box_height

    def draw(self):
        c = self.canv
        if self.bg_color:
            c.setFillColor(self.bg_color)
            c.roundRect(0, 0, self.box_width, self.box_height, 3, fill=1, stroke=0)
        if self.border_left and self.border_color:
            c.setFillColor(self.border_color)
            c.roundRect(0, 0, self.border_left, self.box_height, 1.5, fill=1, stroke=0)
        self.para.drawOn(c, self.padding + self.border_left, self.padding)


class SidebarQuote(Flowable):
    """왼쪽 컬러 바가 있는 인용 블록"""
    def __init__(self, text, width, bar_color=None, font_size=10):
        super().__init__()
        bar_color = bar_color or C["accent"]
        self.bar_w = 3
        self.gap = 8
        self.full_w = width
        style = ParagraphStyle("sq", fontName="KR", fontSize=font_size,
                               leading=font_size * 1.7, textColor=C["text"],
                               alignment=TA_LEFT)
        self.para = Paragraph(text, style)
        pw = width - self.bar_w - self.gap - 10
        _, self.para_h = self.para.wrap(pw, 9999)
        self.h = self.para_h + 12
        self.bar_color = bar_color

    def wrap(self, aw, ah):
        return self.full_w, self.h

    def draw(self):
        c = self.canv
        c.setFillColor(C["highlight"])
        c.roundRect(0, 0, self.full_w, self.h, 2, fill=1, stroke=0)
        c.setFillColor(self.bar_color)
        c.roundRect(0, 0, self.bar_w, self.h, 1, fill=1, stroke=0)
        self.para.drawOn(c, self.bar_w + self.gap, 6)


class KeyInsight(Flowable):
    """핵심 인사이트 하이라이트 박스"""
    def __init__(self, label, text, width, color=None):
        super().__init__()
        color = color or C["accent"]
        self.full_w = width
        self.color = color
        label_style = ParagraphStyle("kil", fontName="KR", fontSize=8,
                                      leading=12, textColor=white)
        body_style = ParagraphStyle("kib", fontName="KR", fontSize=9.5,
                                     leading=15, textColor=C["text"])
        self.label_para = Paragraph(label, label_style)
        self.body_para = Paragraph(text, body_style)
        lw = 90
        _, self.lh = self.label_para.wrap(lw, 999)
        bw = width - 24
        _, self.bh = self.body_para.wrap(bw, 999)
        self.h = self.lh + self.bh + 28

    def wrap(self, aw, ah):
        return self.full_w, self.h

    def draw(self):
        c = self.canv
        c.setFillColor(C["bg_card"])
        c.setStrokeColor(C["border"])
        c.roundRect(0, 0, self.full_w, self.h, 4, fill=1, stroke=1)
        c.setFillColor(self.color)
        c.roundRect(10, self.h - self.lh - 16, 80, self.lh + 8, 3, fill=1, stroke=0)
        self.label_para.drawOn(c, 16, self.h - self.lh - 12)
        self.body_para.drawOn(c, 12, 8)


class ChapterHeader(Flowable):
    """챕터 제목 - 번호 원과 제목 텍스트"""
    def __init__(self, number, title, width):
        super().__init__()
        self.number = str(number)
        self.title = title
        self.full_w = width
        self.h = 18 * mm

    def wrap(self, aw, ah):
        return self.full_w, self.h

    def draw(self):
        c = self.canv
        # 하단 라인
        c.setStrokeColor(C["accent"])
        c.setLineWidth(1.5)
        c.line(0, 4, self.full_w, 4)
        # 번호 원
        cx, cy = 14, self.h / 2 + 2
        c.setFillColor(C["secondary"])
        c.circle(cx, cy, 12, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("KR", 13)
        c.drawCentredString(cx, cy - 5, self.number)
        # 제목 텍스트
        c.setFillColor(C["primary"])
        c.setFont("KR", 18)
        c.drawString(32, cy - 7, self.title)


class StatCard(Flowable):
    """통계 숫자 카드"""
    def __init__(self, value, label, width, color=None):
        super().__init__()
        color = color or C["accent"]
        self.value = value
        self.label = label
        self.card_w = width
        self.card_h = 22 * mm
        self.color = color

    def wrap(self, aw, ah):
        return self.card_w, self.card_h

    def draw(self):
        c = self.canv
        c.setFillColor(C["bg_card"])
        c.setStrokeColor(C["border"])
        c.roundRect(0, 0, self.card_w, self.card_h, 4, fill=1, stroke=1)
        # 상단 컬러 바
        c.setFillColor(self.color)
        c.roundRect(0, self.card_h - 3, self.card_w, 3, 1, fill=1, stroke=0)
        # 숫자
        c.setFillColor(self.color)
        c.setFont("KR", 20)
        c.drawCentredString(self.card_w / 2, self.card_h / 2 + 2, self.value)
        # 라벨
        c.setFillColor(C["text_light"])
        c.setFont("KR", 8)
        c.drawCentredString(self.card_w / 2, 8, self.label)


# ══════════════════════════════════════════════
# 스타일
# ══════════════════════════════════════════════

def S(name):
    styles = {
        "title": ParagraphStyle("title", fontName="KR", fontSize=32, leading=42,
                                textColor=C["primary"], alignment=TA_CENTER, spaceAfter=4*mm),
        "title_sub": ParagraphStyle("title_sub", fontName="KR", fontSize=14, leading=20,
                                    textColor=C["accent"], alignment=TA_CENTER, spaceAfter=8*mm),
        "h1": ParagraphStyle("h1", fontName="KR", fontSize=18, leading=26,
                             textColor=C["primary"], spaceBefore=8*mm, spaceAfter=4*mm),
        "h2": ParagraphStyle("h2", fontName="KR", fontSize=14, leading=20,
                             textColor=C["secondary"], spaceBefore=6*mm, spaceAfter=3*mm),
        "h3": ParagraphStyle("h3", fontName="KR", fontSize=11, leading=17,
                             textColor=C["accent2"], spaceBefore=4*mm, spaceAfter=2*mm),
        "body": ParagraphStyle("body", fontName="KR", fontSize=9.5, leading=16,
                               textColor=C["text"], alignment=TA_JUSTIFY, spaceAfter=3*mm),
        "body_sm": ParagraphStyle("body_sm", fontName="KR", fontSize=8.5, leading=14,
                                  textColor=C["text"], spaceAfter=2*mm),
        "bullet": ParagraphStyle("bullet", fontName="KR", fontSize=9.5, leading=16,
                                 textColor=C["text"], leftIndent=10*mm, bulletIndent=4*mm,
                                 spaceAfter=1.5*mm),
        "source": ParagraphStyle("source", fontName="KR", fontSize=7, leading=10,
                                 textColor=C["text_muted"], spaceAfter=0.8*mm, leftIndent=2*mm),
        "footer": ParagraphStyle("footer", fontName="KR", fontSize=7.5, leading=10,
                                 textColor=C["text_muted"], alignment=TA_CENTER),
        "toc": ParagraphStyle("toc", fontName="KR", fontSize=11, leading=22,
                              textColor=C["primary"], leftIndent=8*mm, spaceAfter=1.5*mm),
        "toc_num": ParagraphStyle("toc_num", fontName="KR", fontSize=11, leading=22,
                                  textColor=C["accent"], spaceAfter=1.5*mm),
        "caption": ParagraphStyle("caption", fontName="KR", fontSize=8, leading=12,
                                  textColor=C["text_muted"], alignment=TA_CENTER, spaceAfter=4*mm),
    }
    return styles[name]

# ══════════════════════════════════════════════
# 테이블 헬퍼
# ══════════════════════════════════════════════

def make_table(headers, rows, col_widths=None, accent_col=None):
    data = [headers] + rows
    if col_widths is None:
        usable = 170 * mm
        col_widths = [usable / len(headers)] * len(headers)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), C["tbl_head"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, -1), "KR"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 13),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.3, C["border"]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [3, 3, 3, 3]),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), C["tbl_alt"]))
    if accent_col is not None:
        for i in range(1, len(data)):
            cmds.append(("TEXTCOLOR", (accent_col, i), (accent_col, i), C["accent"]))
    t.setStyle(TableStyle(cmds))
    return t

def p(text, style_name="body"):
    return Paragraph(text, S(style_name))

def bullet(text):
    return Paragraph(f"  {text}", S("bullet"))

def sp(h=3):
    return Spacer(1, h * mm)

def hr():
    return HRFlowable(width="100%", thickness=0.4, color=C["border"],
                       spaceAfter=3*mm, spaceBefore=1*mm)

CONTENT_W = W - 36 * mm  # usable width

# ══════════════════════════════════════════════
# 페이지 데코레이션
# ══════════════════════════════════════════════

def cover_page(canvas, doc):
    """표지 전용 배경"""
    canvas.saveState()
    # 상단 컬러 블록
    canvas.setFillColor(C["primary"])
    canvas.rect(0, H * 0.45, W, H * 0.55, fill=1, stroke=0)
    # 하단 크림
    canvas.setFillColor(C["bg_light"])
    canvas.rect(0, 0, W, H * 0.45, fill=1, stroke=0)
    # 골드 라인
    canvas.setStrokeColor(C["accent"])
    canvas.setLineWidth(2)
    canvas.line(W * 0.2, H * 0.45, W * 0.8, H * 0.45)
    # 왼쪽 장식 바
    canvas.setFillColor(C["secondary"])
    canvas.rect(0, H * 0.42, 6, H * 0.16, fill=1, stroke=0)
    canvas.restoreState()

def normal_page(canvas, doc):
    """본문 페이지 헤더/푸터"""
    canvas.saveState()
    # 상단 컬러 바
    canvas.setFillColor(C["secondary"])
    canvas.rect(0, H - 8, W, 8, fill=1, stroke=0)
    # 하단 페이지 번호
    canvas.setFillColor(C["text_muted"])
    canvas.setFont("KR", 7)
    canvas.drawCentredString(W / 2, 12, f"- {doc.page} -")
    # 하단 골드 라인
    canvas.setStrokeColor(C["accent"])
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 22, W - 18 * mm, 22)
    # 좌측 장식
    canvas.setFillColor(C["accent"])
    canvas.setFillAlpha(0.15)
    canvas.rect(0, 30, 3, H - 60, fill=1, stroke=0)
    canvas.restoreState()


# ══════════════════════════════════════════════
# 문서 빌드
# ══════════════════════════════════════════════

def build():
    doc = BaseDocTemplate(OUTPUT, pagesize=A4, title="흑염소 진액 종합 보고서", author="AI Research")

    # 표지 프레임
    cover_frame = Frame(18*mm, 18*mm, W - 36*mm, H - 36*mm, id="cover")
    # 본문 프레임
    body_frame = Frame(18*mm, 28, W - 36*mm, H - 24*mm, id="body")

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="Normal", frames=[body_frame], onPage=normal_page),
    ])

    story = []

    # ════════════════════════════════════════════
    # 표지
    # ════════════════════════════════════════════
    story.append(Spacer(1, 55 * mm))
    cover_title = ParagraphStyle("ct", fontName="KR", fontSize=36, leading=48,
                                  textColor=white, alignment=TA_CENTER)
    cover_sub = ParagraphStyle("cs", fontName="KR", fontSize=14, leading=20,
                                textColor=HexColor("#B8860B"), alignment=TA_CENTER)
    cover_info = ParagraphStyle("ci", fontName="KR", fontSize=10, leading=16,
                                 textColor=HexColor("#AAAAAA"), alignment=TA_CENTER)
    cover_meta = ParagraphStyle("cm", fontName="KR", fontSize=9, leading=14,
                                 textColor=C["text_light"], alignment=TA_CENTER)

    story.append(Paragraph("흑염소 진액", cover_title))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("종합 연구 보고서", cover_title))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph("BLACK GOAT EXTRACT  |  COMPREHENSIVE RESEARCH REPORT", cover_sub))
    story.append(Spacer(1, 50 * mm))

    # 하단 메타 정보 (크림 영역)
    story.append(Paragraph("논문  /  역사  /  성분 분석  /  효능  /  유명인  /  제조  /  시장", cover_meta))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("2026년 4월  |  학술 논문 20건 인용  |  전통 의서 6종 참조", cover_meta))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph("AI Research Agent", cover_meta))

    # 페이지 전환
    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("Normal"))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # 목차
    # ════════════════════════════════════════════
    story.append(ChapterHeader("", "목 차", CONTENT_W))
    story.append(sp(6))

    toc = [
        ("01", "흑염소 진액의 역사"),
        ("02", "고전 의서 속 흑염소"),
        ("03", "영양 성분 분석"),
        ("04", "효능별 상세 분석"),
        ("05", "학술 논문 리뷰 (한국)"),
        ("06", "국제 학술 논문 리뷰"),
        ("07", "유명인과 흑염소 진액"),
        ("08", "제조 과정"),
        ("09", "시장 현황"),
        ("10", "주의사항 및 복용법"),
        ("11", "참고문헌"),
    ]
    for num, title in toc:
        toc_style = ParagraphStyle("ts", fontName="KR", fontSize=11, leading=24,
                                    textColor=C["primary"])
        t_row = Table(
            [[Paragraph(num, ParagraphStyle("tn", fontName="KR", fontSize=11,
                                             textColor=C["accent"])),
              Paragraph(title, toc_style)]],
            colWidths=[12 * mm, 140 * mm]
        )
        t_row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, C["border"]),
        ]))
        story.append(t_row)

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 1. 역사
    # ════════════════════════════════════════════
    story.append(ChapterHeader("1", "흑염소 진액의 역사", CONTENT_W))
    story.append(sp(4))

    # 통계 카드 3개
    card_w = CONTENT_W / 3 - 3 * mm
    cards = Table([[
        StatCard("1,500+년", "약용 역사", card_w, C["secondary"]),
        StatCard("6종", "고전 의서 기록", card_w, C["accent"]),
        StatCard("500두", "최초 도입 기록", card_w, C["accent2"]),
    ]], colWidths=[CONTENT_W / 3] * 3)
    cards.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(cards)
    story.append(sp(5))

    story.append(p("1.1 동아시아 최초 기록 - 6세기 중국", "h2"))
    story.append(p(
        "흑염소에 관한 가장 오래된 문헌 기록은 중국 6세기 초(533~544년경) 북위(北魏)의 가사협(賈思勰)이 저술한 "
        "농업 백과사전 『제민요술(齊民要術)』이다. 이 책에서 염소의 사육 방법과 약용 가치를 최초로 언급하였다."
    ))
    story.append(p(
        "이후 한(漢)나라 시대의 『신농본초경(神農本草經)』에도 염소의 약효가 수록되었으며, "
        "명나라 이시진(李時珍)이 1578년에 완성하고 1596년에 출판한 『본초강목(本草綱目)』에는 더욱 구체적인 기록이 남아있다."
    ))
    story.append(SidebarQuote(
        '"염소고기는 원양(元陽, 원기)을 보하며, 허약을 낫게 하고, 피로와 추위를 물리치며, '
        '위장 작용을 보호하고, 마음을 평안케 한다." — 본초강목(本草綱目)',
        CONTENT_W, C["accent"]
    ))
    story.append(sp(2))

    story.append(p("1.2 한국 도입 - 고려시대", "h2"))
    story.append(p(
        "한국민족문화대백과사전 '염소' 항목에 따르면, 한국에서 흑염소를 사육한 가장 이른 기록은 "
        "고려 충선왕 때 중국에서 염소 500여 두를 들여와 경상도에서 사육한 것이다. "
        "약용 목적으로 도입된 것으로 전해진다."
    ))
    story.append(ColorBox(
        "참고: 한국민족문화대백과 원문에는 '안우(安祐)'로 기재되어 있으나, "
        "안우는 공민왕 때 무신(1362년 사망)으로 충선왕 재위(1298~1313)와 시대가 맞지 않아 "
        "안향(安珦)과의 혼동 가능성이 학계에서 제기되고 있다.",
        C["highlight"], C["text"], CONTENT_W, 8, border_left=3, border_color=C["accent"]
    ))
    story.append(sp(3))

    story.append(p("1.3 조선시대 - 동의보감과 고전 의서", "h2"))
    story.append(p(
        "조선 1610년에 완성된 허준의 『동의보감(東醫寶鑑)』에 흑염소가 명시적으로 기록되어 있다."
    ))
    story.append(SidebarQuote(
        '"음기를 기르는 데는 자라, 양기를 돋우는 데는 염소가 으뜸이다." — 동의보감(東醫寶鑑)',
        CONTENT_W, C["secondary"]
    ))
    story.append(sp(1))
    story.append(SidebarQuote(
        '"피로와 허약을 보하고 몸속 기운을 끌어올리며, 마음을 편안하게 다스리고 놀람을 진정시켜준다." — 동의보감',
        CONTENT_W, C["secondary"]
    ))
    story.append(sp(2))
    story.append(p(
        "한방에서는 '인삼은 기(氣)를 보하고, 염소는 혈(血)을 보한다'는 말이 전해질 정도로 "
        "핵심 보양재로 인식되었다. 『증보산림경제(增補山林經濟)』에도 '흑염소는 허약을 낫게 하고 "
        "보양 강장, 회춘하는 약이며 마음을 편하게 한다'고 소개되어 있다."
    ))

    story.append(p("1.4 흑염소의 희소성", "h2"))
    story.append(p(
        "흑염소는 일반 흰 염소보다 개체 수가 적고 번식이 느리며 사육이 까다로워 역사적으로 귀한 보양재로 취급되었다. "
        "조선시대에는 왕실이나 지체 높은 귀족, 혹은 몸이 매우 허약한 사람들에게만 제공되는 식재료였다. "
        "조선의 장수 왕 중 하나인 숙종(재위 1674~1720, 향년 60세)이 기력이 떨어질 때마다 "
        "흑염소를 즐겨 먹었다는 기록이 여러 한의학 자료에서 언급된다."
    ))

    story.append(p("1.5 현대적 상품화", "h2"))
    story.append(p(
        "흑염소 진액이 '건강원' 형태로 현대화된 것은 1970~80년대 한국 경제 성장기와 맞물린다. "
        "도시화가 진행되면서 전통 보양식을 직접 달여 먹기 어려워진 소비자들을 겨냥해 "
        "전문 건강원에서 장시간 달인 진액 파우치 형태의 상품이 등장했다. "
        "1990~2000년대에는 홈쇼핑 채널 확장과 함께 브랜드화된 흑염소 진액 제품이 본격적으로 시장을 형성했다."
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 2. 고전 의서
    # ════════════════════════════════════════════
    story.append(ChapterHeader("2", "고전 의서 속 흑염소", CONTENT_W))
    story.append(sp(4))

    story.append(make_table(
        ["문헌", "편찬 시기", "나라", "핵심 기록"],
        [
            ["제민요술(齊民要術)", "6세기 초 (533~544)", "중국 북위", "염소 사육 및 약용 가치 최초 기록"],
            ["신농본초경(神農本草經)", "한(漢)나라 추정", "중국", "염소 약효 수록"],
            ["본초강목(本草綱目)", "1578년 완성", "중국 명나라", "원기 보강, 허약 회복, 위장 보호 명시"],
            ["동의보감(東醫寶鑑)", "1610년 완성", "조선", "'양기는 염소가 으뜸' 명시"],
            ["증보산림경제", "18세기", "조선", "보양 강장, 회춘 효과 기록"],
            ["명의별록(名醫別錄)", "위진남북조", "중국", "산후 보양, 기력 보강 기록"],
        ],
        [35*mm, 30*mm, 22*mm, 83*mm]
    ))
    story.append(sp(4))

    story.append(KeyInsight(
        "INSIGHT",
        "흑염소는 동아시아 전통의학에서 1,500년 이상의 역사를 가진 대표적 보양 식재료이다. "
        "한국의 동의보감은 흑염소를 양기 보충의 최고 식재료로 꼽았으며, "
        "중국의 본초강목은 원기 회복, 추위 극복, 위장 보호 등 다방면의 효능을 기록하였다.",
        CONTENT_W
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 3. 영양 성분
    # ════════════════════════════════════════════
    story.append(ChapterHeader("3", "영양 성분 분석", CONTENT_W))
    story.append(sp(4))

    story.append(p("3.1 타 육류 대비 영양 비교 (100g 기준)", "h2"))

    story.append(make_table(
        ["성분", "흑염소", "소고기", "돼지고기", "닭고기"],
        [
            ["단백질", "20.6g", "18~21g", "18~20g", "18~20g"],
            ["지방", "3.7g", "7~15g", "7~20g", "5~10g"],
            ["칼슘", "112mg", "~10mg", "~10mg", "~11mg"],
            ["철분", "2.1mg", "2.0mg", "0.9mg", "0.7mg"],
            ["L-카르니틴", "20.8~26.0mg", "15.3mg", "2.4mg", "낮음"],
            ["콜레스테롤", "35.7~37.5mg", "62~89mg", "60~80mg", "73~85mg"],
        ],
        [28*mm, 34*mm, 34*mm, 34*mm, 34*mm],
        accent_col=1
    ))
    story.append(p("출처: 한국축산식품학회 제36차 추계학술발표 (2005), 한국식품영양학회지 Vol.18 (2005)", "caption"))

    story.append(KeyInsight(
        "핵심 포인트",
        "칼슘: 소/돼지/닭 대비 약 10배 이상  |  지방: 소/돼지 대비 1/2~1/5 수준  |  "
        "콜레스테롤: 다른 육류의 절반 이하  |  필수아미노산 비율: 50.3%",
        CONTENT_W, C["secondary"]
    ))
    story.append(sp(4))

    story.append(p("3.2 흑염소 진액(육골액) 아미노산 프로필", "h2"))
    story.append(p("출처: 조길석, 한국식품저장유통학회지 Vol.9 No.4 (2002) | 추출조건: 121도C, 육골:물=5:4, 9시간", "source"))
    story.append(sp(2))

    story.append(make_table(
        ["아미노산", "함량 (mg%)", "주요 기능"],
        [
            ["글리신", "1,464.2", "콜라겐 구성 1위 아미노산, 관절/피부 건강"],
            ["글루탐산", "1,308.0", "감칠맛, 뇌신경 기능, 면역 세포 에너지원"],
            ["프롤린", "828.1", "콜라겐 구성 아미노산, 연골 합성 원료"],
            ["알라닌", "750.2", "에너지 대사, 근육 피로 회복"],
        ],
        [30*mm, 30*mm, 110*mm],
        accent_col=1
    ))
    story.append(sp(3))

    story.append(p("3.3 미네랄 함량", "h2"))
    story.append(make_table(
        ["미네랄", "나트륨", "인", "칼륨", "칼슘", "철"],
        [["함량 (mg%)", "150.0", "105.3", "47.7", "12.7", "0.5"]],
        [28*mm, 28*mm, 28*mm, 28*mm, 28*mm, 28*mm]
    ))
    story.append(sp(3))

    story.append(p("3.4 특수 기능성 성분", "h2"))
    story.append(make_table(
        ["성분", "특징", "주요 기능"],
        [
            ["L-카르니틴", "20.8~26.0mg/100g", "지방산 미토콘드리아 운반, 에너지 전환 촉진"],
            ["타우린", "타 육류보다 높음", "심혈관 보호, 항산화 작용"],
            ["카르노신/안세린", "등심에서 높은 비율", "항산화, 항피로, pH 완충 (일반 붉은 육류와 차별화)"],
            ["아라키돈산(ARA)", "함유", "인슐린 민감성, 면역 기능 조절"],
        ],
        [35*mm, 40*mm, 95*mm]
    ))
    story.append(sp(2))
    story.append(ColorBox(
        "참고: 일부 업계 자료에서 비타민E(토코페롤) 45mg/100g으로 기재하고 있으나, "
        "이 수치는 동료심사(peer-review) 학술논문에서 원문 출처가 확인되지 않는다. "
        "일반 육류의 비타민E 함량(1~2mg/100g)과 비교하면 이례적으로 높아 추가 검증이 필요하다.",
        C["highlight"], C["text"], CONTENT_W, 8, border_left=3, border_color=C["red"]
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 4. 효능
    # ════════════════════════════════════════════
    story.append(ChapterHeader("4", "효능별 상세 분석", CONTENT_W))
    story.append(sp(4))

    effs = [
        ("4.1 뼈 건강 / 골다공증 예방", [
            "2024년 IJMS 논문(Akter 외): 흑염소 추출물이 에스트로겐 유사 활성을 보유함을 세포 수준에서 확인.",
            "Wnt/beta-catenin 경로 조절을 통해 조골세포(osteoblast) 분화를 촉진한다.",
            "RANKL 유도 파골세포(osteoclast) 형성 억제: RANK, TRAF6 등 핵심 신호분자 하향조절.",
            "2015년 Song 외: 한약재 6종 첨가 추출물(BG-E6)에서 조골세포 광물화 170.3% 달성.",
            "칼슘 흡수 활성: 대조군 대비 615~628% 달성. 모든 추출물에서 파골세포 억제 효과 확인.",
        ]),
        ("4.2 항산화 / 항염", [
            "2024년 J. Food Biochemistry: 효소 처리 저분자 가수분해물(<3kDa)에서 항산화 아미노산 41.24% 함유.",
            "RAW 264.7 세포에서 NO/PGE2 생성 억제, TNF-alpha/IL-1beta 발현 억제 확인.",
            "MAPK 및 NF-kappaB 경로 억제를 통한 항염 메커니즘 규명.",
            "2019년 Kim 외: FRAP, ABTS, ORAC 3가지 방법으로 흑염소육의 항산화력 검증.",
        ]),
        ("4.3 피부 건강 / 아토피 억제", [
            "2024년 Foods(MDPI): 피부 각질세포(HaCaT)에서 상처 치유 촉진 확인.",
            "필라그린/로리크린/인볼루크린 발현 증가로 피부 장벽 강화.",
            "JNK/p38/ERK MAPK 경로 억제로 아토피 피부염 억제 메커니즘 최초 규명.",
            "아쿠아포린 생성 증가로 피부 수분 유지 효과도 확인.",
        ]),
        ("4.4 항피로 / 운동 능력 향상", [
            "2023년 J. Functional Foods: 2X~3X 농도 보충 시 악력/수영 지구력 유의미 향상.",
            "혈청 젖산/AST/LDH 감소로 피로 지표 개선.",
            "간 글리코겐 함량 증가로 에너지 저장 개선. 장내 미생물총 조절 효과 확인.",
        ]),
        ("4.5 산후 회복 / 갱년기 / 기력 보충", [
            "산후: 철분(2.1mg/100g), 고단백(20.6g), 칼슘(112mg)이 출산 후 혈액 손실 보충에 기여.",
            "갱년기: 에스트로겐 유사 활성 확인(2024 IJMS). 한방에서 '신양(腎陽)' 보충 식재료 분류.",
            "면역: 아연(T세포 활성), 글루탐산(면역세포 에너지원), 항산화 성분(면역세포 보호).",
            "빈혈: 헴철 형태로 식물성 철분보다 흡수율 2~3배 높음.",
            "전통의학 기록(동의보감/명의별록) 기반. 인체 대상 RCT 데이터는 아직 부족함.",
        ]),
    ]

    for title, points in effs:
        story.append(p(title, "h2"))
        for pt in points:
            story.append(bullet(pt))
        story.append(sp(1))

    story.append(sp(3))
    story.append(p("효능별 연구 근거 수준 요약", "h2"))
    story.append(make_table(
        ["효능", "근거 수준", "핵심 연구 결과"],
        [
            ["뼈 건강/골다공증", "세포실험 (2015, 2024)", "조골세포 170% 촉진, 에스트로겐 유사 활성"],
            ["항산화", "세포실험 (2019, 2024)", "FRAP/ABTS/ORAC 검증, 항산화 아미노산 41%"],
            ["항염", "세포실험 (2024)", "MAPK/NF-kappaB 경로 억제, 염증인자 감소"],
            ["피부/아토피", "세포실험 (2024)", "피부장벽 강화, MAPK 억제 최초 규명"],
            ["항피로/운동", "동물실험 (2023)", "지구력 향상, 젖산 감소, 글리코겐 증가"],
            ["장내 미생물", "동물실험 (2023)", "유익균 비율 조절 확인"],
            ["산후/갱년기", "전통의학+세포실험", "동의보감 기재, 에스트로겐 유사 활성 확인"],
        ],
        [32*mm, 32*mm, 106*mm]
    ))
    story.append(sp(2))
    story.append(ColorBox(
        "연구 한계: 현재까지 대부분 세포실험(in vitro) 또는 동물실험(in vivo) 수준이며, "
        "인체 대상 무작위배정 임상시험(RCT) 데이터는 매우 부족하다. "
        "본 보고서의 효능 정보는 의학적 치료 효과를 보장하지 않는다.",
        C["highlight"], C["text"], CONTENT_W, 8.5, border_left=3, border_color=C["red"]
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 5. 한국 논문
    # ════════════════════════════════════════════
    story.append(ChapterHeader("5", "학술 논문 리뷰 (한국)", CONTENT_W))
    story.append(sp(4))

    kr_papers = [
        ("흑염소 육골액의 적정 추출시간 및 성분 분석에 관한 연구",
         "조길석 (원주대학교 식품과학과)", "한국식품저장유통학회지, Vol.9 No.4 (2002)",
         "최적 추출 조건 규명: 121도C, 육골:물=5:4, 9시간. 글리신 1,464mg%, 글루탐산 1,308mg%, "
         "프롤린 828mg% 등 핵심 아미노산 정량 분석 완료. 건조 수율 32.1%.",
         "https://db.koreascholar.com/Article/Detail/40922"),
        ("홍삼꿀을 첨가한 흑염소 육골액 음료의 특성",
         "양희태, 김미원, 최화정", "한국식품영양학회지, Vol.18 No.2 (2005)",
         "흑염소 조단백질이 우육/돈육보다 높고, 조지방은 가장 낮음 확인. "
         "나트륨은 타 육류보다 낮고 칼슘/철분은 높음. 성인병 예방 기능성 음료 가능성 제시.",
         "https://kiss.kstudy.com/Detail/Ar?key=2453618"),
        ("흑염소 육의 영양학적 품질",
         "한국축산식품학회 제36차 추계학술발표", "학술대회 발표 (2005)",
         "조단백질 21.1%, 조지방 3.7%, 콜레스테롤 35.7~37.5mg/100g(우육/돈육보다 현저히 낮음). "
         "L-카르니틴 20.8~26.0mg/100g. 필수아미노산 비율 50.3%.",
         "https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=NPAP08167958"),
        ("흑염소육의 특이성 발굴 및 육골즙 생산기술 확립",
         "정부 연구보고서 (TRKO201400023254)", "ScienceON 등재 (2014)",
         "흑염소육 고유 성분 규명 및 육골즙 표준 생산기술을 체계적으로 확립한 종합 연구보고서.",
         "https://scienceon.kisti.re.kr/srch/selectPORSrchReport.do?cn=TRKO201400023254"),
    ]

    link_style = ParagraphStyle("link", fontName="KR", fontSize=7, leading=10,
                                 textColor=HexColor("#2C5F2D"), spaceAfter=1*mm, leftIndent=2*mm)
    for title, author, journal, result, url in kr_papers:
        story.append(p(title, "h3"))
        story.append(p(f"저자: {author}  |  학술지: {journal}", "source"))
        story.append(p(result))
        story.append(Paragraph(f'<a href="{url}" color="#2C5F2D">{url}</a>', link_style))
        story.append(sp(1))

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 6. 국제 논문
    # ════════════════════════════════════════════
    story.append(ChapterHeader("6", "국제 학술 논문 리뷰", CONTENT_W))
    story.append(sp(4))

    intl = [
        ("Korean Black Goat Extract Exerts Estrogen-like Osteoprotective Effects",
         "Akter R, Son JS, Ahn JC et al.",
         "Int. J. Mol. Sci. 25(13):7247 (2024)  |  DOI: 10.3390/ijms25137247",
         "에스트로겐 유사 활성 보유 확인. Wnt/beta-catenin 경로 조절 조골세포 분화 촉진. "
         "RANKL 유도 파골세포 형성 억제. 폐경 후 골다공증 예방 가능성 제시.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC11241464/"),
        ("Low-Molecular-Weight Hydrolysate from Black Goat Extract: Antioxidative & Anti-Inflammatory",
         "Journal of Food Biochemistry (Wiley)",
         "J. Food Biochem. (2024)  |  DOI: 10.1155/2024/7155015",
         "효소 처리 저분자 가수분해물(&lt;3kDa)에서 항산화 아미노산 41.24% 함유. "
         "MAPK/NF-kappaB 경로 억제 항염 효과 규명.",
         "https://onlinelibrary.wiley.com/doi/10.1155/2024/7155015"),
        ("Effect of Water Extract from Black Goat Meat and Medicinal Herb on Osteoblast/Osteoclast",
         "Song HN, Leem KH, Kwun IS",
         "J. Nutr. Health 48(2):157-166 (2015)  |  DOI: 10.4163/jnh.2015.48.2.157",
         "한약재 6종 첨가 추출물(BG-E6) 조골세포 광물화 170.3%. "
         "칼슘 흡수 활성 615~628%. 파골세포 억제 효과 확인.",
         "https://synapse.koreamed.org/articles/1081382"),
        ("Nutritional and Antioxidative Properties of Black Goat Meat Cuts",
         "Kim HJ, Kim HJ, Jang A",
         "Asian-Australas. J. Anim. Sci. (2019)  |  DOI: 10.5713/ajas.18.0951",
         "PUFA/SFA 비율 0.57 (우육 0.13의 4배 이상). "
         "카르노신보다 안세린 비율 높음(일반 붉은 육류와 차별화). FRAP/ABTS/ORAC 항산화력 검증.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC6722310/"),
        ("Skin Function Improvement and Anti-Inflammatory Effects of Goat Meat Extract",
         "Foods (MDPI) 13(23):3934",
         "Foods (2024)  |  DOI: 10.3390/foods13233934",
         "피부 각질세포 상처 치유 촉진. 필라그린/로리크린/인볼루크린 발현 증가 피부장벽 강화. "
         "JNK/p38/ERK MAPK 경로 억제 아토피 억제 메커니즘 최초 규명.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC11641237/"),
        ("Goat Meat Extract Improves Exercise Performance and Reduces Fatigue",
         "Hsu TH, Hong HT, Lee GC et al.",
         "J. Functional Foods (2023)  |  ScienceDirect",
         "2X~3X 농도 보충 시 악력/수영 지구력 향상. 혈청 젖산/AST/LDH 감소. "
         "간 글리코겐 증가, 장내 미생물총 조절 확인.",
         "https://www.sciencedirect.com/science/article/pii/S1756464623000105"),
        ("Korean Native Black Goat: A Review on Characteristics and Meat Quality",
         "Food Sci. Anim. Resour. 45(2)",
         "Food Sci. Anim. Resour. (2025)  |  PMID: 40093635",
         "장수/통영/당진 3품종 종합 리뷰. 저포화지방/저콜레스테롤 + 고단백/고칼슘/고철분. "
         "L-카르니틴, 크레아틴, 카르노신, 안세린 등 생리활성 성분 체계적 정리. 최적 도축 12개월 이후 권장.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC11907424/"),
        ("Physicochemical Properties of Black Korean Goat Meat with Various Slaughter Ages",
         "Animals (MDPI) 13(4):692",
         "Animals (2023)  |  PMID: 36830479",
         "3/6/9/12/24/36개월 도축 비교. 월령 증가 시 지방/콜라겐/유리아미노산 증가. "
         "12개월 이후 도축이 영양학적으로 적정.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC9951984/"),
    ]

    for title, author, journal, result, url in intl:
        story.append(p(title, "h3"))
        story.append(p(f"{author}  |  {journal}", "source"))
        story.append(p(result, "body_sm"))
        story.append(Paragraph(f'<a href="{url}" color="#2C5F2D">{url}</a>', link_style))
        story.append(sp(1))

    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 7. 유명인
    # ════════════════════════════════════════════
    story.append(ChapterHeader("7", "유명인과 흑염소 진액", CONTENT_W))
    story.append(sp(4))

    story.append(p("7.1 역사적 인물", "h2"))
    story.append(p(
        "조선 숙종(재위 1674~1720, 향년 60세)은 조선 왕 중 장수 6위로, 기력이 떨어질 때마다 "
        "흑염소를 즐겨 먹었다는 기록이 여러 한의학 관련 자료에서 언급된다. "
        "왕실에서는 흑염소를 귀한 보양재로 별도 관리했다고 전해진다."
    ))

    story.append(p("7.2 현대 유명인", "h2"))

    celeb_data = [
        ["인물", "분야", "관련 내용"],
        ["설운도", "트로트 가수",
         "흑염소 진액 브랜드 '진생록' 앰배서더. 강진 자연방목 흑염소 + 22가지 한약재. "
         "후배 가수들(조정민, 두리, 송민경 등)에게 직접 권유."],
        ["이경제 원장", "한의사",
         "'이경제 흑염소 진액' 브랜드 운영. 경희대 한의학과 출신. 뽕잎 먹인 국내산 흑염소. "
         "판매 회사(행복을파는사람들) 2022년 연매출 약 786억원."],
        ["허재", "농구 지도자",
         "MBC '사장님 귀는 당나귀 귀'에서 선수단에게 흑염소 수육 보양식 제공. 화제 에피소드."],
    ]
    t = Table(celeb_data, colWidths=[25*mm, 25*mm, 120*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C["tbl_head"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, -1), "KR"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 14),
        ("GRID", (0, 0), (-1, -1), 0.3, C["border"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 1), (-1, 1), C["tbl_alt"]),
        ("BACKGROUND", (0, 3), (-1, 3), C["tbl_alt"]),
    ]))
    story.append(t)
    story.append(sp(4))

    story.append(p("7.3 문화적 맥락", "h2"))
    story.append(bullet("삼복더위 보양 문화: 삼계탕, 보신탕과 함께 3대 여름 보양식으로 분류"))
    story.append(bullet("산후 조리 문화: 출산 후 체력 회복을 위해 흑염소 진액을 섭취하는 오래된 관행"))
    story.append(bullet("지역 특산물: 장수군, 남원, 강진, 산청 등에서 자연방목 흑염소를 지역 특산물로 육성"))
    story.append(bullet("장수마을 연관: 장수군은 흑염소 주물럭이 지역 대표 음식으로 자리매김"))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 8. 제조 과정
    # ════════════════════════════════════════════
    story.append(ChapterHeader("8", "제조 과정", CONTENT_W))
    story.append(sp(4))

    story.append(p("8.1 전통 제조법", "h2"))
    steps = [
        ("Step 1", "3~6개월령, 10~15kg 흑염소 도축 및 세척"),
        ("Step 2", "핏물 제거 (정제수에 1~2시간 담금)"),
        ("Step 3", "한약재 배합: 녹용, 당귀, 가시오가피, 대추, 구기자, 황기, 인삼 등"),
        ("Step 4", "가마솥에 넣고 저온에서 12~48시간 고아냄"),
        ("Step 5", "기름 걷어내고 여과 후 포장 (고기 100g당 약 100ml 추출 기준)"),
    ]
    for step, desc in steps:
        story.append(ColorBox(
            f"<b>{step}</b>  {desc}",
            C["bg_card"], C["text"], CONTENT_W, 9, border_left=3, border_color=C["secondary"]
        ))
        story.append(sp(1))

    story.append(sp(3))
    story.append(p("8.2 현대 공업 공정", "h2"))
    story.append(make_table(
        ["단계", "공정", "세부 사항"],
        [
            ["1", "원료 입고/검수", "흑염소 원료 품질 확인"],
            ["2", "세척/전처리", "핏물 제거, 약재 준비"],
            ["3", "계량/배합", "육골:물 비율 5:4 (논문 최적 조건)"],
            ["4", "고압 추출", "110~130도, 12~36시간 (최적: 121도, 9시간)"],
            ["5", "3단 필터링", "불순물 제거"],
            ["6", "냉각/기름 제거", "지방 분리"],
            ["7", "꿀/약재 혼합", "기호성 개선"],
            ["8", "1차 살균", "미생물 안전성 확보"],
            ["9", "마이크로 필터링", "초미세 여과"],
            ["10", "충진/2차 살균/포장", "최종 제품 출하"],
        ],
        [12*mm, 33*mm, 125*mm]
    ))
    story.append(sp(4))

    story.append(p("8.3 좋은 흑염소 진액의 기준", "h2"))
    story.append(make_table(
        ["항목", "기준"],
        [
            ["원료 연령", "3~6개월령 (나이 들수록 잡내가 강해짐)"],
            ["흑염소 함유량", "제품 표시 기준 20% 이상 확인"],
            ["고형분 함량", "12% 이상이 '진한 제품' 기준"],
            ["약재 배합", "국산 한약재 11~18종 사용 여부"],
            ["가공 방식", "고압 추출 + 다단 필터링 여부"],
            ["무첨가", "인공 감미료, 방부제 무첨가 확인"],
        ],
        [35*mm, 135*mm]
    ))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 9. 시장 현황
    # ════════════════════════════════════════════
    story.append(ChapterHeader("9", "시장 현황", CONTENT_W))
    story.append(sp(4))

    story.append(p("9.1 한국 건강식품 시장 맥락", "h2"))
    story.append(p(
        "2023년 한국 건강기능식품 시장 규모는 6조 1,415억 원이다. "
        "흑염소 진액은 건강기능식품이 아닌 '일반식품' 또는 '건강식품' 카테고리로 분류되어 "
        "별도 공식 통계가 없다. 홍삼/프로바이오틱스/비타민이 시장의 51.5%를 점유하고 있으며, "
        "흑염소는 전통 보양식 틈새 시장에 해당한다."
    ))

    story.append(p("9.2 주요 브랜드 및 가격대", "h2"))
    story.append(make_table(
        ["브랜드", "형태", "가격대", "특징"],
        [
            ["이경제 흑염소 진액", "70ml x 30포", "~54,900원", "18가지 한약재, 회사 매출 786억"],
            ["김오곤 흑염소 진액", "30포 x 4박스", "~90,900원", "4.7점/612리뷰"],
            ["설운도 진생록", "파우치형", "시중가", "강진 자연방목, 22가지 약재"],
            ["산너미목장", "120포(한마리)", "농장 직판", "1마리 기준 판매"],
            ["매포흑염소목장", "파우치형", "시중가", "30년 경력, 고형분 12%"],
            ["한살림 흑염소진액", "파우치형", "생협 가격", "국산 한약재 11가지"],
        ],
        [38*mm, 28*mm, 28*mm, 76*mm]
    ))
    story.append(sp(2))
    story.append(p("30포(1개월분) 기준 5~10만 원대가 주류이다. 산지 흑염소 시세: 거세 20,000원/kg, 비거세 18,000원/kg (2024년 11월 기준).", "body_sm"))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 10. 주의사항
    # ════════════════════════════════════════════
    story.append(ChapterHeader("10", "주의사항 및 복용법", CONTENT_W))
    story.append(sp(4))

    story.append(p("10.1 복용 금기 대상", "h2"))
    story.append(make_table(
        ["대상", "이유"],
        [
            ["열성 체질 (소양인)", "상열 악화, 안면홍조/두통/불면 유발 가능"],
            ["고혈압/당뇨/고지혈증", "고영양으로 혈압/혈당 부담 가중"],
            ["간/신장 기능 저하자", "고단백 대사 부담"],
            ["소화기 질환자", "속쓰림, 복통, 설사 유발 가능"],
            ["임산부/수유부", "전문가 상담 필수"],
            ["알레르기 체질", "동물성 단백질 알레르기 반응 위험"],
        ],
        [45*mm, 125*mm]
    ))
    story.append(sp(3))

    story.append(p("10.2 부작용 증상 (발생 시 즉시 복용 중단)", "h2"))
    story.append(ColorBox(
        "어지럼증 / 가슴 두근거림 / 발열 / 안면홍조 / 불면증 / 불안감 / 식은땀 / "
        "소화불량 / 속쓰림 / 설사 / 피부 트러블 / 알레르기 반응",
        HexColor("#FFF0F0"), C["red"], CONTENT_W, 9, border_left=3, border_color=C["red"]
    ))
    story.append(sp(3))

    story.append(p("10.3 권장 섭취량 및 방법", "h2"))
    story.append(make_table(
        ["항목", "권장"],
        [
            ["1일 권장량", "70~100ml (1포), 최대 140ml 초과 금지"],
            ["복용 시점", "식후 (공복 시 위 부담)"],
            ["첫 복용", "소량부터 시작, 몸 반응 확인"],
            ["복용 주기", "2~4주 복용 후 1~2주 휴식"],
            ["장기 복용", "4~6주 복용 후 2주 이상 휴식"],
            ["최대 연속", "2~3개월 후 반드시 휴식기"],
        ],
        [35*mm, 135*mm]
    ))
    story.append(sp(3))

    story.append(p("10.4 보관법", "h2"))
    story.append(bullet("개봉 전: 직사광선 피해 서늘한 곳 보관"))
    story.append(bullet("여름철 / 2개월 이상 장기 보관: 냉장 필수"))
    story.append(bullet("개봉 후: 가능한 빨리 섭취"))
    story.append(bullet("냉동 보관: 금지 (성분 파괴 및 식감 변화)"))
    story.append(PageBreak())

    # ════════════════════════════════════════════
    # CH 11. 참고문헌
    # ════════════════════════════════════════════
    story.append(ChapterHeader("11", "참고문헌", CONTENT_W))
    story.append(sp(4))

    ref_link_style = ParagraphStyle("reflink", fontName="KR", fontSize=7, leading=10,
                                      textColor=HexColor("#2C5F2D"), spaceAfter=2.5*mm, leftIndent=2*mm)
    ref_text_style = ParagraphStyle("reftext", fontName="KR", fontSize=7.5, leading=11,
                                     textColor=C["text"], spaceAfter=0.3*mm, leftIndent=2*mm)

    refs = [
        ("[1] Akter R et al. (2024). Korean Black Goat Extract Exerts Estrogen-like Osteoprotective Effects. Int J Mol Sci. 25(13):7247.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC11241464/"),
        ("[2] Low-Molecular-Weight Hydrolysate from Black Goat Extract (2024). J Food Biochem. DOI: 10.1155/2024/7155015.",
         "https://onlinelibrary.wiley.com/doi/10.1155/2024/7155015"),
        ("[3] Song HN, Leem KH, Kwun IS (2015). Effect of Water Extract from Black Goat Meat on Osteoblast. J Nutr Health. 48(2):157-166.",
         "https://synapse.koreamed.org/articles/1081382"),
        ("[4] Kim HJ, Kim HJ, Jang A (2019). Nutritional and Antioxidative Properties of Black Goat Meat Cuts. Asian-Australas J Anim Sci.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC6722310/"),
        ("[5] Skin Function Improvement of Goat Meat Extract (2024). Foods (MDPI). 13(23):3934.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC11641237/"),
        ("[6] Hsu TH et al. (2023). Goat Meat Extract Improves Exercise Performance. J Functional Foods.",
         "https://www.sciencedirect.com/science/article/pii/S1756464623000105"),
        ("[7] Korean Native Black Goat: A Review (2025). Food Sci Anim Resour. 45(2). PMID: 40093635.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC11907424/"),
        ("[8] Physicochemical Properties of Black Korean Goat Meat (2023). Animals (MDPI). 13(4):692.",
         "https://pmc.ncbi.nlm.nih.gov/articles/PMC9951984/"),
        ("[9] 조길석 (2002). 흑염소 육골액의 적정 추출시간 및 성분 분석. 한국식품저장유통학회지. 9(4).",
         "https://db.koreascholar.com/Article/Detail/40922"),
        ("[10] 양희태 외 (2005). 홍삼꿀을 첨가한 흑염소 육골액 음료의 특성. 한국식품영양학회지. 18(2).",
         "https://kiss.kstudy.com/Detail/Ar?key=2453618"),
        ("[11] 한국축산식품학회 (2005). 흑염소 육의 영양학적 품질. 제36차 추계학술발표대회.",
         "https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=NPAP08167958"),
        ("[12] 흑염소육의 특이성 발굴 및 육골즙 생산기술 확립 (2014). ScienceON 연구보고서.",
         "https://scienceon.kisti.re.kr/srch/selectPORSrchReport.do?cn=TRKO201400023254"),
        ("[13] 흑염소 중탕액의 제조방법 (2011). 특허 KR101079147B1.",
         "https://patents.google.com/patent/KR101079147B1/en"),
        ("[14] 흑염소 진액 음료 제조방법. 특허 KR101807667B1.",
         "https://patents.google.com/patent/KR101807667B1/ko"),
        ("[15] 허준 (1610). 동의보감(東醫寶鑑). 조선.", None),
        ("[16] 이시진 (1578). 본초강목(本草綱目). 명나라.", None),
        ("[17] 한국민족문화대백과사전. 흑염소/염소 항목.",
         "https://encykorea.aks.ac.kr/Article/E0037114"),
        ("[18] 한국민속대백과사전. 염소고기.",
         "https://folkency.nfm.go.kr/topic/%EC%97%BC%EC%86%8C%EA%B3%A0%EA%B8%B0"),
        ("[19] (사)한국흑염소협회 공식 사이트. 흑염소 효능 안내.", None),
        ("[20] 한국건강기능식품협회 (2024). 건강기능식품 시장 현황.",
         "https://www.khff.or.kr/"),
    ]

    for ref_text, url in refs:
        story.append(Paragraph(ref_text, ref_text_style))
        if url:
            story.append(Paragraph(f'<a href="{url}" color="#2C5F2D">{url}</a>', ref_link_style))
        else:
            story.append(sp(1))

    story.append(sp(10))
    story.append(hr())
    disclaimer = ParagraphStyle("disc", fontName="KR", fontSize=7.5, leading=12,
                                 textColor=C["text_muted"], alignment=TA_CENTER)
    story.append(Paragraph(
        "본 보고서는 AI 리서치 에이전트가 학술 데이터베이스(PubMed, PMC, ScienceON, KCI, KISS, DBpia), "
        "전통 의서, 특허 데이터베이스, 언론 보도를 종합하여 작성하였습니다.",
        disclaimer
    ))
    story.append(Paragraph(
        "의학적 판단을 대체하지 않으며, 건강 관련 결정은 반드시 전문의와 상담하시기 바랍니다.",
        disclaimer
    ))
    story.append(sp(3))
    story.append(Paragraph("2026년 4월 2일 작성  |  AI Research Agent  |  v2.0", disclaimer))

    doc.build(story)
    print(f"PDF 생성 완료: {OUTPUT}")


if __name__ == "__main__":
    build()
