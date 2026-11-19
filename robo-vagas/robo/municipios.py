"""Municípios do portal, lidos do próprio site (sem duplicar listas):
- dados/municipios.js  -> os municípios do programa e o centro de cada um;
- js/config.js         -> CIDADES_VIZINHAS (cidade do programa -> cidades próximas que também a abastecem).

Uma vaga interessa se a cidade dela é um município do programa OU uma cidade vizinha de algum deles
(Rio Claro, Sorocaba, Piracicaba...). No portal, a vaga de uma cidade vizinha aparece para os municípios
que a listam como vizinha, com a etiqueta de "município vizinho" (mesma regra dos cursos)."""
import re
from functools import lru_cache

from . import RAIZ
from .texto import normalizar

REPO = RAIZ.parent


def _ler(rel):
    return (REPO / rel).read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def programa():
    """{nome: (lat, lon)} dos municípios do programa."""
    txt = _ler("dados/municipios.js")
    pares = re.findall(r'"([^"]+)"\s*:\s*\{\s*"lat"\s*:\s*(-?[\d.]+)\s*,\s*"lon"\s*:\s*(-?[\d.]+)\s*\}', txt)
    if not pares:
        raise RuntimeError("não consegui ler dados/municipios.js (mudou o formato?)")
    return {nome: (float(lat), float(lon)) for nome, lat, lon in pares}


@lru_cache(maxsize=1)
def vizinhas():
    """{município do programa: [cidades vizinhas]} de CIDADES_VIZINHAS (js/config.js)."""
    txt = _ler("js/config.js")
    ini = txt.index("const CIDADES_VIZINHAS")
    bloco = txt[ini:txt.index("};", ini)]
    bloco = re.sub(r"/\*.*?\*/", "", bloco, flags=re.S)
    return {k: re.findall(r'"([^"]+)"', lista) for k, lista in re.findall(r'"([^"]+)"\s*:\s*\[([^\]]*)\]', bloco)}


@lru_cache(maxsize=1)
def _indice():
    """nome normalizado -> nome oficial, para o programa e as vizinhas."""
    idx = {}
    for nome in programa():
        idx[normalizar(nome)] = nome
    for lista in vizinhas().values():
        for nome in lista:
            idx.setdefault(normalizar(nome), nome)
    return idx


def eh_do_programa(nome):
    return nome in programa()


def limpar_cidade(cidade):
    """'Campinas - SP', 'Campinas/SP', 'Campinas (SP)', 'Campinas, São Paulo' -> 'Campinas'."""
    c = (cidade or "").strip()
    c = re.sub(r"\s*\((?:sp|são paulo|sao paulo)\)\s*$", "", c, flags=re.I)
    c = re.sub(r"\s*[-/,]\s*(?:sp|são paulo|sao paulo)\s*$", "", c, flags=re.I)
    return c.strip()


def cidade_alvo(cidade):
    """Nome oficial do município (do programa ou vizinho) a que a cidade da vaga pertence; '' se não interessa."""
    return _indice().get(normalizar(limpar_cidade(cidade)), "")


def todas_as_cidades():
    """Programa primeiro (ordem alfabética), depois as vizinhas que não são do programa."""
    prog = sorted(programa(), key=normalizar)
    extras = sorted({n for l in vizinhas().values() for n in l if n not in programa()}, key=normalizar)
    return prog + extras


def aparece_para(cidade):
    """Municípios do programa em que uma vaga desta cidade aparece (a própria, se for do programa, e quem a tem como vizinha)."""
    saida = [cidade] if eh_do_programa(cidade) else []
    saida += sorted(m for m, l in vizinhas().items() if cidade in l and m != cidade)
    return saida
