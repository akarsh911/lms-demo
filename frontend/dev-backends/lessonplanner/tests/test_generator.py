import generator


def test_minutes_round_half_up_like_javascript():
    assert generator.minutes_for("explanation", 35) == 11
    assert generator.minutes_for("homework", 10) == 2
