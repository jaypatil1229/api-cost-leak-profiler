from app.semantic.normalizer import normalize_prompt
def test_whitespace(): assert normalize_prompt("  Explain   machine learning!  ") == "Explain machine learning!"
def test_empty_fence_none():
    assert normalize_prompt("") == ""
    assert normalize_prompt(None) == ""
    assert normalize_prompt("Use:\n```py\nprint( 1 )\n```") == "Use: print( 1 )"
def test_keep_case_punctuation(): assert normalize_prompt("Why? YES!") == "Why? YES!"
