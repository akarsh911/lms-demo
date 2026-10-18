from PIL import Image

from sheet import Layout, read, render


def test_reads_back_what_was_bubbled():
    layout = Layout(questions=30, options=4)
    filled = {0: [1], 1: [3], 2: [], 3: [0, 2], 24: [2], 29: [0]}
    responses = read(render(layout, filled=filled), layout)
    assert len(responses) == 30
    for index, chosen in enumerate(responses):
        assert chosen == filled.get(index, []), index


def test_survives_a_scan_with_a_margin_and_a_different_size():
    layout = Layout(questions=10, options=4)
    filled = {index: [index % 4] for index in range(10)}
    sheet = render(layout, filled=filled)
    page = Image.new("L", (1400, 1960), 255)
    page.paste(sheet.resize((1300, 1840)), (40, 50))
    assert read(page, layout) == [[index % 4] for index in range(10)]
