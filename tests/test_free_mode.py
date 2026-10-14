from pathlib import Path

from app.downloader import Downloaded
from app.free_mode import guess_metadata


def dl(caption: str) -> Downloaded:
    tags = [w for w in caption.split() if w.startswith("#")]
    return Downloaded(path=Path("x.mp4"), caption=caption, hashtags=tags)


def test_asmr_hashtag_is_high_confidence():
    m = guess_metadata(dl("Crunchy soap cubes 🧼 #asmr #soapcutting"))
    assert m.is_asmr is True and m.confidence == "high"
    assert m.triggers == ["soap cutting", "crunchy sounds"]
    assert m.title == "ASMR Soap Cutting | Crunchy soap cubes 🧼"
    assert "#soapcutting" in m.hashtags


def test_trigger_words_without_asmr_are_medium():
    m = guess_metadata(dl("Slicing kinetic sand for 10 minutes"))
    assert m.is_asmr is True and m.confidence == "medium"
    assert m.triggers == ["kinetic sand"]


def test_satisfying_counts_as_asmr():
    m = guess_metadata(dl("So oddly satisfying to watch"))
    assert m.is_asmr is True and m.triggers == []


def test_no_clues_means_not_asmr():
    m = guess_metadata(dl("Our trip to the beach #holiday @friend"))
    assert m.is_asmr is False and m.confidence == "low"


def test_caption_that_already_says_asmr_is_kept_as_title():
    m = guess_metadata(dl("ASMR tapping on glass jars\nmore text #asmr"))
    assert m.title == "ASMR tapping on glass jars"
    assert m.triggers == ["tapping"]


def test_empty_caption_uses_template():
    m = guess_metadata(dl(""))
    assert m.title == "Relaxing ASMR Sounds"
    assert m.description == "A relaxing ASMR video. Best with headphones."


def test_description_drops_hashtags_and_adds_sentence():
    m = guess_metadata(dl("Pink slime pokes\n#slime #asmr #satisfying"))
    assert m.description == "Pink slime pokes\n\nRelax with slime in this ASMR video. Best with headphones."
    assert "slime" in m.tags and "asmr" in m.tags
