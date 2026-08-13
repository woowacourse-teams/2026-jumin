from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
FINAL = ROOT / "final"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

PRIMARY = "#4356D8"
NAVY = "#14213D"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size=size, index=6 if bold else 0)


def center_text(draw: ImageDraw.ImageDraw, text: str, y: int, width: int, face, fill: str, spacing: int = 12):
    box = draw.multiline_textbbox((0, 0), text, font=face, spacing=spacing, align="center")
    draw.multiline_text(
        ((width - (box[2] - box[0])) / 2, y), text, font=face, fill=fill, spacing=spacing, align="center"
    )


def rounded_paste(base: Image.Image, overlay: Image.Image, box: tuple[int, int, int, int], radius: int):
    x, y, width, height = box
    overlay = overlay.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    base.paste(overlay, (x, y), mask)


def add_device(base: Image.Image, screenshot: Image.Image, box: tuple[int, int, int, int], radius: int):
    x, y, width, height = box
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x + 18, y + 24, x + width + 18, y + height + 24), radius=radius, fill=(10, 19, 43, 96)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    base.paste(shadow, (0, 0), shadow)
    ImageDraw.Draw(base).rounded_rectangle((x, y, x + width, y + height), radius=radius, fill=NAVY)
    inset = max(26, width // 32)
    rounded_paste(base, screenshot, (x + inset, y + inset, width - inset * 2, height - inset * 2), radius - inset)


def background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, PRIMARY)
    draw = ImageDraw.Draw(image)
    draw.ellipse((-width // 5, -height // 7, width // 2, height // 6), fill="#5064E4")
    draw.ellipse((width * 3 // 4, height // 25, width * 6 // 5, height // 4), fill="#5064E4")
    return image


PHONE_COPY = [
    ("목적지 주변 주차장을\n한눈에 비교", "600m 안 공영주차장을 거리 · 가격 · 균형순으로 확인해요"),
    ("요금과 운영 정보를\n가기 전에 확인", "예상 요금과 거리, 운영시간을 자세히 살펴보세요"),
    ("원하는 지도 앱으로\n바로 길찾기", "네이버 지도 · 카카오맵 · TMAP으로 목적지를 전달해요"),
]

IPAD_COPY = [
    ("목적지 주변 주차장을 한눈에 비교", "600m 안 공영주차장을 거리 · 가격 · 균형순으로 확인해요"),
    ("요금과 운영 정보를 가기 전에 확인", "예상 요금과 거리, 운영시간을 자세히 살펴보세요"),
    ("원하는 지도 앱으로 바로 길찾기", "네이버 지도 · 카카오맵 · TMAP으로 목적지를 전달해요"),
]

SCREENS = ["results", "detail", "directions"]


def build_phone():
    for index, (name, (headline, subtitle)) in enumerate(zip(SCREENS, PHONE_COPY), start=1):
        image = background((1284, 2778))
        draw = ImageDraw.Draw(image)
        center_text(draw, headline, 120, 1284, font(72, bold=True), WHITE, 18)
        center_text(draw, subtitle, 382, 1284, font(31), "#E8EBFF")
        screen = Image.open(RAW / f"iphone-{name}-localhost.png")
        add_device(image, screen, (151, 570, 982, 2142), 100)
        image.save(FINAL / f"iphone-6.5-ko-{index:02d}.png", optimize=True)


def build_ipad():
    for index, (name, (headline, subtitle)) in enumerate(zip(SCREENS, IPAD_COPY), start=1):
        image = background((2048, 2732))
        draw = ImageDraw.Draw(image)
        center_text(draw, headline, 92, 2048, font(76, bold=True), WHITE)
        center_text(draw, subtitle, 240, 2048, font(31), "#E8EBFF")
        screen = Image.open(RAW / f"ipad-{name}-localhost.png")
        add_device(image, screen, (180, 380, 1688, 2260), 86)
        image.save(FINAL / f"ipad-13-ko-{index:02d}.png", optimize=True)


if __name__ == "__main__":
    FINAL.mkdir(parents=True, exist_ok=True)
    build_phone()
    build_ipad()
