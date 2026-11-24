"""Check de vaga: a vaga bate com os requisitos do programa? E ela aparece localizada no mapa?

Vale para vagas de qualquer fonte da plataforma:
  - robô (vagas/ativas.json, é o padrão) e o que o portal publica (dados/vagas-robo.json);
  - vagas cadastradas à mão (dados.json) e na planilha da equipe (CSV publicado);
  - uma vaga avulsa, por link (LinkedIn, Indeed, qualquer site): `--link URL` (a vaga é lida da página).

Requisitos = o mesmo filtro do robô (robo/filtro.py + config.toml): região, contrato, título de entrada, ensino superior,
anos de experiência, sinais de golpe, prazo. Só vale o que a vaga informa: sem a descrição, a conferência é pelo
título, cidade, contrato e prazo (o relatório avisa).
Mapa = onde o pino da vaga cai no portal: ponto próprio (≈ 1 km), centro do município, ou sem posição.

Uso (na raiz do repositório):
  python -m robo.checar --novas 7                 vagas que entraram nos últimos 7 dias
  python -m robo.checar --fonte portal            as publicadas no portal
  python -m robo.checar --fonte manual            as de dados.json
  python -m robo.checar --fonte planilha          as da planilha da equipe
  python -m robo.checar --link https://...        uma vaga avulsa
  --relatorio ARQ                                 acrescenta o resultado a um relatório existente"""
import argparse
import csv
import io
import json
import re
import sys
import tomllib
import urllib.request
from datetime import date, timedelta

from . import RAIZ, municipios
from .fontes import Vaga
from . import filtro, portal

REPO = RAIZ.parent
LOCAIS = REPO / "dados" / "vagas-local.json"
UA = "Mozilla/5.0 (compatible; leitor-de-vagas/1.0)"


def carregar_config():
    with (RAIZ / "config.toml").open("rb") as f:
        return tomllib.load(f)


def _locais():
    try:
        return json.loads(LOCAIS.read_text(encoding="utf-8")).get("locais", {})
    except (OSError, ValueError):
        return {}


# ---------------------------------------------------------------- fontes
def _de_ativas(dias=None):
    hoje = date.today()
    saida = []
    for d in portal.ler_ativas():
        if dias is not None:
            try:
                if (hoje - date.fromisoformat(d.get("entrou_em", "")[:10])).days > dias:
                    continue
            except ValueError:
                continue
        saida.append(d)
    return saida


def _de_portal():
    try:
        return json.loads(portal.SAIDA.read_text(encoding="utf-8")).get("vagas", [])
    except (OSError, ValueError):
        return []


def _de_manual():
    try:
        j = json.loads((REPO / "dados.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [{"id": v.get("link") or v.get("cargo"), "cargo": v.get("cargo", ""), "empresa": v.get("empresa", ""),
             "cidade": v.get("municipio", ""), "municipio": v.get("municipio", ""), "tipo": v.get("tipo", ""),
             "link": v.get("link", ""), "fonte": "cadastro manual"} for v in j.get("vagas", [])]


def _de_planilha():
    cfg = (REPO / "js" / "config.js").read_text(encoding="utf-8")
    m = re.search(r'PLANILHA_VAGAS_CSV_URL\s*=\s*"([^"]+)"', cfg)
    if not m:
        return []
    req = urllib.request.Request(m.group(1), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        texto = r.read().decode("utf-8", "replace")
    saida = []
    for row in csv.DictReader(io.StringIO(texto)):
        if (row.get("status") or "Aberto").strip().lower() not in ("aberto", ""):
            continue
        saida.append({"id": row.get("link") or row.get("cargo"), "cargo": row.get("cargo", ""), "empresa": row.get("empresa", ""),
                      "cidade": row.get("municipio", ""), "municipio": row.get("municipio", ""), "tipo": row.get("tipo_contrato", ""),
                      "link": row.get("link", ""), "descricao": row.get("descricao", ""), "fonte": "planilha da equipe"})
    return saida


def _de_link(url):
    """Vaga avulsa: lê o título e o texto da página (JSON-LD quando houver)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        html = r.read().decode("utf-8", "replace").replace("&quot;", '"')
    titulo = (re.search(r'"title":"([^"]+)"', html) or re.search(r"<title>([^<]+)</title>", html) or [None, "(sem título)"])[1]
    empresa = (re.search(r'"hiringOrganization":\{[^}]*?"name":"([^"]+)"', html) or [None, ""])[1]
    cidade = (re.search(r'"addressLocality":"([^"]+)"', html) or [None, ""])[1]
    texto = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", html, flags=re.S)
    texto = re.sub(r"\s+", " ", texto)[:6000]
    return [{"id": url, "cargo": titulo.strip(), "empresa": empresa, "cidade": cidade, "municipio": cidade, "tipo": "",
             "link": url, "descricao": texto, "fonte": "link avulso"}]


# ---------------------------------------------------------------- checagem
def _vaga(d):
    modelo = {"presencial": "on-site", "híbrido": "hybrid", "hibrido": "hybrid", "remoto": "remote"}.get((d.get("modalidade") or "").strip().lower(), "")
    v = Vaga(d.get("empresa", ""), d.get("cargo", ""), d.get("link", ""), d.get("fonte", ""), d.get("cidade", "") or d.get("municipio", ""), "SP",
             modelo, d.get("tipo", ""), d.get("descricao") or d.get("desc") or "", d.get("prazo", ""), d.get("publicada", ""))
    v.experiencia = d.get("experiencia", "") or ""
    v.escolaridade = d.get("escolaridade", "") or ""
    return v


def checar_requisitos(d, cfg):
    """(bate, [motivos]). Mesma regra do robô."""
    v = _vaga(d)
    ok = filtro.avaliar(v, cfg)
    motivos = [m for m in v.motivos if not m.startswith(("+", "-"))]
    nota = f" (nota {v.nota})" if ok else ""
    return ok, (motivos or ["dentro do perfil" + nota])


def checar_mapa(d, locais):
    """Onde o pino cai: 'ponto no mapa (≈ 1 km)', 'só no centro do município' ou 'sem posição'."""
    if str(d.get("id")) in locais or d.get("_aprox"):
        return "ponto no mapa (≈ 1 km)"
    nome = d.get("municipio") or d.get("cidade") or ""
    cid = municipios.cidade_alvo(nome) or nome
    if cid and (cid in municipios.programa() or cid in {c for l in municipios.vizinhas().values() for c in l}):
        return "só no centro do município"
    return "sem posição"


def conferir(vagas, cfg):
    locais = _locais()
    linhas = []
    for d in vagas:
        ok, motivos = checar_requisitos(d, cfg)
        linhas.append({"cargo": d.get("cargo", ""), "empresa": d.get("empresa", ""), "cidade": d.get("municipio") or d.get("cidade", ""),
                       "fonte": d.get("fonte", ""), "link": d.get("link", ""), "bate": ok, "motivos": motivos,
                       "mapa": checar_mapa(d, locais), "sem_descricao": not (d.get("descricao") or d.get("desc"))})
    return linhas


def relatorio(linhas, titulo="Check das vagas"):
    n = len(linhas)
    fora = [l for l in linhas if not l["bate"]]
    sem_ponto = [l for l in linhas if l["mapa"] != "ponto no mapa (≈ 1 km)"]
    sem_pos = [l for l in linhas if l["mapa"] == "sem posição"]
    out = [f"## {titulo}", "",
           f"- {n} vagas conferidas | **{n - len(fora)} batem com o perfil**, {len(fora)} não batem",
           f"- Mapa: {n - len(sem_ponto)} com ponto próprio, {len(sem_ponto) - len(sem_pos)} só no centro do município, {len(sem_pos)} sem posição", ""]
    if any(l["sem_descricao"] for l in linhas):
        out += ["_Sem a descrição da vaga, a conferência é pelo título, cidade, contrato e prazo._", ""]
    if fora:
        out += ["### Não batem com o perfil", "", "| Vaga | Empresa | Cidade | Motivo |", "|---|---|---|---|"]
        out += [f"| {l['cargo'][:60]} | {l['empresa'][:30]} | {l['cidade']} | {'; '.join(l['motivos'])[:90]} |" for l in fora[:60]]
        out.append("")
    if sem_pos:
        out += ["### Sem posição no mapa", ""] + [f"- {l['cargo'][:60]} ({l['empresa'][:30]}, {l['cidade'] or 'cidade não informada'})" for l in sem_pos[:40]] + [""]
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check de vaga: requisitos do programa e posição no mapa")
    ap.add_argument("--fonte", choices=["robo", "portal", "manual", "planilha"], default="robo")
    ap.add_argument("--novas", type=int, metavar="DIAS", help="só vagas que entraram nos últimos DIAS dias (fonte robô)")
    ap.add_argument("--link", help="vaga avulsa, lida da página do link")
    ap.add_argument("--relatorio", help="acrescenta o resultado a este arquivo")
    a = ap.parse_args(argv)
    cfg = carregar_config()
    if a.link:
        vagas, titulo = _de_link(a.link), "Check da vaga"
    elif a.fonte == "robo":
        vagas, titulo = _de_ativas(a.novas), f"Check das vagas novas ({a.novas} dias)" if a.novas else "Check das vagas do robô"
    else:
        vagas = {"portal": _de_portal, "manual": _de_manual, "planilha": _de_planilha}[a.fonte]()
        titulo = f"Check das vagas ({a.fonte})"
    texto = relatorio(conferir(vagas, cfg), titulo)
    print(texto)
    if a.relatorio:
        with open(a.relatorio, "a", encoding="utf-8") as f:
            f.write("\n" + texto + "\n")


if __name__ == "__main__":
    main()
