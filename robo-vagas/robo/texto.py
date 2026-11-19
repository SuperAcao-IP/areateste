import unicodedata


def normalizar(t: str) -> str:
    """minúsculas, sem acento, espaços simples — para comparar palavras."""
    t = unicodedata.normalize("NFKD", t or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(t.lower().split())
