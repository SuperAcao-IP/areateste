"""Status do dia de cada fonte de vagas, em dados/fontes/AAAA-MM-DD.json. O relatório diário lê daqui."""
import json
from datetime import date

from . import RAIZ

PASTA = RAIZ / "dados" / "fontes"
FONTE_DESATIVADA = "fonte desativada"
NAO_RODOU_TESTE = "não rodou (teste)"
SO_DIAS_DE_BUSCA = ("LinkedIn vagas", "Indeed")   # fontes do Claude (comando /buscar-linkedin-indeed, segunda): fora disso não é erro
FONTES = ["Gupy", "Catho", "InfoJobs", "vagas.com", "LinkedIn vagas", "Indeed"]


def _arq(dia=None, pasta=None):
    return (pasta or PASTA) / f"{dia or date.today().isoformat()}.json"


def ler(dia=None, pasta=None):
    arq = _arq(dia, pasta)
    if not arq.exists():
        return {}
    return json.loads(arq.read_text(encoding="utf-8"))


def registrar(nome, status, vagas=0, motivo="", aprovadas=None, dia=None, pasta=None, funil=None):
    """Grava o status da fonte. Sem aprovadas ou funil, mantém o que já havia no dia."""
    dados = ler(dia, pasta)
    anterior = dados.get(nome, {})
    dados[nome] = {"status": status, "vagas": int(vagas), "motivo": motivo}
    novas = aprovadas if aprovadas is not None else anterior.get("aprovadas")
    if novas is not None:
        dados[nome]["aprovadas"] = int(novas)
    if funil is not None or anterior.get("funil"):
        dados[nome]["funil"] = funil if funil is not None else anterior["funil"]
    _salvar(dados, dia, pasta)


def _salvar(dados, dia=None, pasta=None):
    arq = _arq(dia, pasta)
    arq.parent.mkdir(parents=True, exist_ok=True)
    arq.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def contar(nome, categoria=None, aprovada=False, dia=None, pasta=None):
    """Soma uma vaga avaliada pelo Chrome ao funil da fonte."""
    dados = ler(dia, pasta)
    d = dados.setdefault(nome, {"status": "OK", "vagas": 0, "motivo": ""})
    if aprovada:
        d["aprovadas"] = d.get("aprovadas", 0) + 1
    if categoria:
        d.setdefault("funil", {})
        d["funil"][categoria] = d["funil"].get(categoria, 0) + 1
    _salvar(dados, dia, pasta)


def linhas_funil(dados):
    """Uma linha por fonte: lidas, aprovadas e os cortes em ordem decrescente."""
    saida = []
    for nome in FONTES:
        d = dados.get(nome)
        if not d or not (d.get("status") == "ERRO" or d.get("funil") or d.get("aprovadas") or d.get("vagas")):
            continue
        if d.get("status") == "ERRO":   # fonte com erro: nada lido, nada aprovado, sem cortes antigos
            saida.append(f"{nome}: ERRO, 0 lidas")
            continue
        partes = [f"{d.get('vagas', 0)} lidas", f"{d.get('aprovadas', 0)} aprovadas"]
        partes += [f"{c}: {n}" for c, n in sorted((d.get("funil") or {}).items(), key=lambda x: -x[1])]
        saida.append(f"{nome}: " + ", ".join(partes))
    return saida


def linhas(dados, motivo_faltando="não verificada hoje", desativadas=(), dia_de_busca=True):
    """Uma linha por fonte, com OK ou ERRO."""
    saida = []
    for nome in FONTES:
        if nome in desativadas:
            saida.append(f"{nome}: {FONTE_DESATIVADA}")
            continue
        d = dados.get(nome)
        if not d and not dia_de_busca and nome in SO_DIAS_DE_BUSCA:
            saida.append(f"{nome}: não rodou hoje (só às segundas)")
            continue
        if not d:
            saida.append(f"{nome}: {NAO_RODOU_TESTE}" if motivo_faltando == NAO_RODOU_TESTE else f"{nome}: ERRO, 0 vagas. Motivo: {motivo_faltando}")
            continue
        texto = f"{nome}: {d['status']}, {d['vagas']} vagas"
        if d.get("aprovadas") is not None:
            texto += f", {d['aprovadas']} novas aprovadas"
        if d.get("motivo"):
            texto += f". Motivo: {d['motivo']}"
        saida.append(texto)
    return saida
