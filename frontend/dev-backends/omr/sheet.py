from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

WIDTH = 1240
HEIGHT = 1754
MARK = 44
MARK_INSET = 60
ROWS_PER_COLUMN = 24
COLUMN_WIDTH = 370
FIRST_X = 130
FIRST_Y = 340
ROW_HEIGHT = 52
BUBBLE_GAP = 54
RADIUS = 17
INNER = 0.6
FILLED = 0.45
DARK = 128
MAX_QUESTIONS = ROWS_PER_COLUMN * 3
WINDOW = 180
TEXT_X = MARK_INSET + MARK + 120


@dataclass(frozen=True)
class Layout:
    questions: int
    options: int

    def bubble(self, index: int, option: int) -> Tuple[float, float]:
        column, row = divmod(index, ROWS_PER_COLUMN)
        x = FIRST_X + column * COLUMN_WIDTH + 70 + option * BUBBLE_GAP
        y = FIRST_Y + row * ROW_HEIGHT
        return float(x), float(y)


def corners() -> List[Tuple[float, float]]:
    half = MARK / 2
    near = MARK_INSET + half
    return [(near, near), (WIDTH - near, near), (near, HEIGHT - near), (WIDTH - near, HEIGHT - near)]


def _font(size: int):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def render(layout: Layout, title: str = "", filled: Optional[Dict[int, List[int]]] = None) -> Image.Image:
    if not 1 <= layout.questions <= MAX_QUESTIONS:
        raise ValueError(f"a sheet holds 1 to {MAX_QUESTIONS} questions")
    image = Image.new("L", (WIDTH, HEIGHT), 255)
    draw = ImageDraw.Draw(image)
    for x, y in corners():
        draw.rectangle([x - MARK / 2, y - MARK / 2, x + MARK / 2, y + MARK / 2], fill=0)
    draw.text((TEXT_X, MARK_INSET), title or "Answer sheet", fill=0, font=_font(36))
    draw.text((TEXT_X, MARK_INSET + 60), "Name: ______________________   Roll No.: ________", fill=0, font=_font(28))
    draw.text((TEXT_X, MARK_INSET + 120), "Fill one bubble per question completely with a dark pen.", fill=0, font=_font(22))
    letters = _font(20)
    for index in range(layout.questions):
        if index % ROWS_PER_COLUMN == 0:
            for option in range(layout.options):
                x, y = layout.bubble(index, option)
                draw.text((x - 6, y - 52), chr(65 + option), fill=0, font=letters)
        x0, y0 = layout.bubble(index, 0)
        draw.text((x0 - 70, y0 - 12), f"{index + 1}.", fill=0, font=_font(24))
        for option in range(layout.options):
            x, y = layout.bubble(index, option)
            draw.ellipse([x - RADIUS, y - RADIUS, x + RADIUS, y + RADIUS], outline=0, width=2)
            if filled and option in filled.get(index, []):
                inner = RADIUS - 4
                draw.ellipse([x - inner, y - inner, x + inner, y + inner], fill=0)
    return image


def _centroid(image: Image.Image, box: Tuple[int, int, int, int]) -> Optional[Tuple[float, float]]:
    region = image.crop(box)
    width = region.width
    total = sx = sy = 0
    for offset, value in enumerate(region.tobytes()):
        if value < DARK:
            total += 1
            sx += offset % width
            sy += offset // width
    if total < MARK * MARK * 0.3:
        return None
    return box[0] + sx / total, box[1] + sy / total


def _register(image: Image.Image) -> Tuple[float, float, float, float]:
    window = WINDOW
    found = []
    for x, y in corners():
        left = 0 if x < WIDTH / 2 else WIDTH - window
        top = 0 if y < HEIGHT / 2 else HEIGHT - window
        found.append(_centroid(image, (left, top, left + window, top + window)))
    top_left, _, _, bottom_right = found
    if top_left is None or bottom_right is None:
        return 1.0, 1.0, 0.0, 0.0
    (tx0, ty0), (tx1, ty1) = corners()[0], corners()[3]
    scale_x = (bottom_right[0] - top_left[0]) / (tx1 - tx0)
    scale_y = (bottom_right[1] - top_left[1]) / (ty1 - ty0)
    return scale_x, scale_y, top_left[0] - tx0 * scale_x, top_left[1] - ty0 * scale_y


def _ink(image: Image.Image, x: float, y: float, radius: float) -> float:
    reach = radius * INNER
    box = (int(x - reach), int(y - reach), int(x + reach) + 1, int(y + reach) + 1)
    region = image.crop(box)
    inside = dark = 0
    for offset, value in enumerate(region.tobytes()):
        px = box[0] + offset % region.width - x
        py = box[1] + offset // region.width - y
        if px * px + py * py <= reach * reach:
            inside += 1
            dark += value < DARK
    return dark / inside if inside else 0.0


def read(image: Image.Image, layout: Layout) -> List[List[int]]:
    page = image.convert("L").resize((WIDTH, HEIGHT))
    scale_x, scale_y, offset_x, offset_y = _register(page)
    radius = RADIUS * (scale_x + scale_y) / 2
    responses = []
    for index in range(layout.questions):
        chosen = []
        for option in range(layout.options):
            x, y = layout.bubble(index, option)
            if _ink(page, x * scale_x + offset_x, y * scale_y + offset_y, radius) >= FILLED:
                chosen.append(option)
        responses.append(chosen)
    return responses
