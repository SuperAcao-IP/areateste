"""Leitura e escrita do vagas/vagas.csv (histórico de todas as vagas avaliadas, para nunca mostrar a mesma vaga duas vezes)."""
import csv
import re

from . import RAIZ
from .texto import normalizar

CSV = RAIZ / "vagas" / "vagas.csv"
COLUNAS = ["data", "empresa", "cargo", "plataforma", "link", "modelo", "nota", "status", "observacao",
           "cidade", "municipio", "tipo", "salario", "prazo"]
MODELO_PT = {"hybrid": "híbrido", "on-site": "presencial", "remote": "remoto"}


def ler():
    if not CSV.exists():
        return []
    with CSV.open(encoding="utf-8", newline="") as f:
        return [{c: (l.get(c) or "") for c in COLUNAS} for l in csv.DictReader(f)]


def salvar(linhas):
    CSV.parent.mkdir(parents=True, exist_ok=True)
    temp = CSV.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS, lineterminator="\n")
        w.writeheader()
        w.writerows(linhas)
    temp.replace(CSV)


def _migrar():
    """Acrescenta as colunas novas a um CSV antigo, sem perder nenhuma linha."""
    if not CSV.exists():
        return
    with CSV.open(encoding="utf-8", newline="") as f:
        cabecalho = next(csv.reader(f), [])
    if cabecalho != COLUNAS:
        salvar(ler())


def prazo_de(linha):
    """Prazo da coluna própria ou, nas linhas antigas, do texto da observação."""
    if linha.get("prazo"):
        return linha["prazo"]
    m = re.search(r"prazo\s+(\d[\d/\-]+)", linha.get("observacao") or "", re.I)
    return m.group(1) if m else ""


def chaves_existentes(linhas):
    links, pares = set(), set()
    for l in linhas:
        links.add((l.get("link") or "").split("?")[0].rstrip("/"))
        pares.add(par_empresa_cargo(l.get("empresa", ""), l.get("cargo", "")))
    return links, pares


_LOCAL = (r"sao paulo|sp|capital|grande sao paulo|abc paulista|zona (norte|sul|leste|oeste)|osasco|barueri|guarulhos|campinas|santo andre|"
          r"sao bernardo( do campo)?|sao caetano( do sul)?|diadema|maua|cotia|carapicuiba|taboao da serra|caieiras|franco da rocha|itaquaquecetuba|"
          r"mogi das cruzes|sorocaba|jundiai|santos|limeira|americana|indaiatuba|rio claro|piracicaba|sao vicente|sumare|hortolandia|valinhos|vinhedo|itu|salto")


def cargo_sem_local(cargo):
    """Tira do título os trechos que são só o lugar: 'Analista - Cotia, São Paulo' e 'Analista (SP)' viram 'analista'."""
    partes = re.split(r"\s+[-–—|]\s+|,|/|\(|\)", normalizar(cargo))
    fica = [p.strip() for p in partes if p.strip() and not re.fullmatch(_LOCAL, p.strip())]
    return " ".join(fica)


def par_empresa_cargo(empresa, cargo):
    return normalizar(empresa), cargo_sem_local(cargo)


def ja_vista(vaga, links, pares):
    return vaga.link.split("?")[0].rstrip("/") in links or par_empresa_cargo(vaga.empresa, vaga.cargo) in pares


def acrescentar(vagas_com_status, hoje):
    _migrar()
    novo = not CSV.exists()
    CSV.parent.mkdir(parents=True, exist_ok=True)
    with CSV.open("a", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS, lineterminator="\n")
        if novo:
            w.writeheader()
        for v, status in vagas_com_status:
            obs = "; ".join(v.motivos)
            if v.prazo:
                obs = f"prazo {v.prazo}; " + obs
            w.writerow({"data": hoje, "empresa": v.empresa, "cargo": v.cargo, "plataforma": v.plataforma,
                        "link": v.link, "modelo": MODELO_PT.get(v.modelo, v.modelo), "nota": v.nota,
                        "status": status, "observacao": obs, "cidade": v.cidade, "prazo": v.prazo,
                        "salario": v.salario, "municipio": v.municipio, "tipo": v.tipo})
