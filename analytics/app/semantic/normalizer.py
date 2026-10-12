import re

_WHITESPACE = re.compile(r"\s+")
_MARKDOWN_FENCE = re.compile(r"```([^\n]*)\n([\s\S]*?)```", re.MULTILINE)


def normalize_prompt(prompt: str | None) -> str:
    """Collapse formatting whitespace and unwrap code fences without changing meaning."""
    if prompt is None:
        return ""
    prompt = _MARKDOWN_FENCE.sub(lambda match: match.group(2), prompt)
    return _WHITESPACE.sub(" ", prompt).strip()
