"""As vagas que o robô mantém (vagas/ativas.json) e o arquivo que o portal lê (dados/vagas-robo.json).

- Vaga aprovada pelo filtro entra em ativas.json.
- A conferência semanal (robo/conferir.py) tira de ativas.json a vaga fechada ou velha.
- exportar() grava dados/vagas-robo.json com as melhores vagas de cada município (no máximo `max_por_municipio`,
  config.toml [portal]): as demais ficam guardadas em ativas.json e entram quando alguma sair.
  O portal só baixa o arquivo quando a pessoa escolhe a cidade (js/conectores.js, carregarVagasRobo)."""
import json
from datetime import date

from . import RAIZ, municipios

REPO = RAIZ.parent
ATIVAS = RAIZ / "vagas" / "ativas.json"
SAIDA = REPO / "dados" / "vagas-robo.json"
MODELO_PT = {"hybrid": "Híbrido", "on-site": "Presencial", "remote": "Remoto"}


def chave(link):
    return (link or "").split("?")[0].split("#")[0].rstrip("/")


def ler_ativas():
    if not ATIVAS.exists():
        return []
    return json.loads(ATIVAS.read_text(encoding="utf-8"))


def salvar_ativas(lista):
    ATIVAS.parent.mkdir(parents=True, exist_ok=True)
    lista = sorted(lista, key=lambda a: (a.get("municipio", ""), a.get("entrou_em", ""), a.get("cargo", "")))
    ATIVAS.write_text(json.dumps(lista, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def de_vaga(v, hoje):
    """Registro de ativas.json a partir de uma Vaga aprovada."""
    return {
        "id": chave(v.link), "cargo": v.cargo, "empresa": v.empresa or "Empresa não informada", "cidade": municipios.limpar_cidade(v.cidade),
        "municipio": v.municipio, "tipo": v.tipo, "modalidade": MODELO_PT.get(v.modelo, ""), "experiencia": v.experiencia,
        "escolaridade": v.escolaridade, "link": v.link, "fonte": v.plataforma, "publicada": (v.publicada or "")[:10],
        "prazo": (v.prazo or "")[:10], "nota": v.nota, "entrou_em": hoje, "conferida_em": hoje,
    }


def acrescentar(vagas, hoje=None):
    """Põe as aprovadas em ativas.json (sem repetir link). Devolve quantas entraram."""
    hoje = hoje or date.today().isoformat()
    ativas = ler_ativas()
    ids = {a["id"] for a in ativas}
    novas = 0
    for v in vagas:
        if chave(v.link) in ids:
            continue
        ativas.append(de_vaga(v, hoje))
        ids.add(chave(v.link))
        novas += 1
    salvar_ativas(ativas)
    return novas


def _data_br(iso):
    try:
        d = date.fromisoformat(iso[:10])
        return d.strftime("%d/%m/%Y")
    except (ValueError, TypeError):
        return ""


_MINUSCULAS = {"de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o", "na", "no"}


def sem_caixa_alta(t):
    """'AUXILIAR DE SERVIÇOS GERAIS - LIMEIRA' -> 'Auxiliar de Serviços Gerais - Limeira'. Título já misto fica como está."""
    if not t or not t.isupper():
        return t
    palavras = t.lower().split(" ")
    return " ".join(p if (i and p in _MINUSCULAS) else p[:1].upper() + p[1:] for i, p in enumerate(palavras))


def para_portal(a):
    """Formato do cartão de vaga do portal (o mesmo de normalizarVagaTrampolim em js/conectores.js)."""
    return {
        "id": a["id"], "cargo": sem_caixa_alta(a["cargo"]), "empresa": a["empresa"], "cidade": a["cidade"], "municipio": a["municipio"],
        "tipo": a.get("tipo", ""), "modalidade": a.get("modalidade", ""), "experiencia": a.get("experiencia", ""),
        "escolaridade": a.get("escolaridade", ""), "publicadaEm": _data_br(a.get("publicada") or a.get("entrou_em", "")),
        "link": a["link"], "fonte": a["fonte"],
    }


def selecionar(ativas, max_por_municipio=25):
    """As melhores de cada município: maior nota, depois a mais recente."""
    por_mun = {}
    for a in ativas:
        por_mun.setdefault(a.get("municipio", ""), []).append(a)
    saida = []
    for mun in sorted(por_mun):
        lista = sorted(por_mun[mun], key=lambda a: a.get("publicada") or a.get("entrou_em") or "", reverse=True)   # mais recente primeiro
        lista.sort(key=lambda a: -(a.get("nota") or 0))                                                          # maior nota primeiro (sort estável)
        saida += lista[:max_por_municipio * 4 if mun == "Online" else max_por_municipio]     # as remotas valem para todos: cabem mais
    return saida


def exportar(ativas=None, hoje=None, max_por_municipio=None):
    """Grava dados/vagas-robo.json. Devolve o número de vagas gravadas."""
    ativas = ler_ativas() if ativas is None else ativas
    hoje = hoje or date.today().isoformat()
    if max_por_municipio is None:
        try:
            import tomllib
            with (RAIZ / "config.toml").open("rb") as f:
                max_por_municipio = tomllib.load(f).get("portal", {}).get("max_por_municipio", 25)
        except OSError:
            max_por_municipio = 25
    escolhidas = selecionar(ativas, max_por_municipio)
    linhas = [json.dumps(para_portal(a), ensure_ascii=False, separators=(",", ":")) for a in escolhidas]
    explicacao = ("Vagas achadas pelo robô de vagas (robo-vagas/) nos sites públicos de emprego, filtradas pelo perfil do programa "
                  "e conferidas toda segunda (a vaga fechada sai). Gerado automaticamente: não edite à mão. Para tirar uma vaga, "
                  "ponha um termo dela em excluir_sempre (robo-vagas/config.toml).")
    nl = chr(10)
    cabeca = [f' "atualizado": {json.dumps(hoje)},', f' "explicacao": {json.dumps(explicacao, ensure_ascii=False)},', f' "no_robo": {len(ativas)},']
    # uma vaga por linha: o arquivo fica legível e o diff semanal mostra só o que mudou
    texto = "{" + nl + nl.join(cabeca) + nl + ' "vagas": [' + nl + ("," + nl).join("  " + l for l in linhas) + (nl if linhas else "") + " ]" + nl + "}" + nl
    SAIDA.write_text(texto, encoding="utf-8", newline=nl)
    return len(escolhidas)
