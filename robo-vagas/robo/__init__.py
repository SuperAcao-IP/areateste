"""Robô de vagas do SuperAção SP: busca, filtro, publicação no portal e conferência semanal (sem candidatura)."""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# O console do Windows (cp1252) quebra com acento e emoji nas mensagens: força UTF-8.
for _fluxo in (sys.stdout, sys.stderr):
    try:
        _fluxo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
