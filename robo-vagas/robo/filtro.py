"""Filtro do perfil do SuperAção SP: vagas de entrada para pessoas de famílias de baixa renda,
em geral sem ensino médio completo e com pouca ou nenhuma experiência formal.

Ordem (o primeiro corte vale; a lista de motivos explica no relatório):
  1. excluir_sempre (empresa, título, descrição ou link com o termo)
  2. sinal de golpe (taxa, investimento inicial, kit, marketing multinível...)
  3. cidade fora dos municípios do programa e das cidades vizinhas
  4. trabalho remoto NÃO é cortado: a vaga entra marcada como "Remoto" e o portal avisa que pode exigir computador e internet próprios
  5. contrato: estágio, trainee, PJ, autônomo, banco de talentos, freelancer
  6. título de nível acima da entrada (analista, gerente, sênior, técnico...)
  7. exige ensino superior ou muitos anos de experiência
  8. título precisa ser de função de entrada (`titulo_entrada` do config.toml)
  9. nota (0 a 10) >= nota_minima
Os termos ficam no config.toml, seção [filtro]."""
import re
from datetime import date

from . import municipios
from .texto import normalizar

# Gupy: tipo de vaga -> como aparece no portal ("" = corta)
TIPOS_GUPY = {
    "vacancy_type_effective": "CLT",
    "vacancy_type_apprentice": "Jovem Aprendiz",
    "vacancy_type_temporary": "Temporário",
    "vacancy_type_internship": "",
    "vacancy_type_trainee": "",
    "vacancy_type_talent_pool": "",
    "vacancy_legal_entity": "",
    "vacancy_type_freelancer": "",
    "vacancy_type_autonomous": "",
    "vacancy_type_associate": "",
    "vacancy_type_lecturer": "",
    "vacancy_type_external_vacancy": "",
    "vacancy_type_summer": "",
}
MOTIVO_TIPO_GUPY = {
    "vacancy_type_internship": "estágio (exige matrícula em curso)",
    "vacancy_type_trainee": "trainee (exige ensino superior)",
    "vacancy_type_talent_pool": "banco de talentos (não é vaga aberta)",
    "vacancy_legal_entity": "PJ",
    "vacancy_type_freelancer": "freelancer",
    "vacancy_type_autonomous": "autônomo",
    "vacancy_type_associate": "cooperado/associado",
    "vacancy_type_lecturer": "professor/palestrante",
    "vacancy_type_external_vacancy": "vaga externa",
    "vacancy_type_summer": "programa de verão",
}

_SEM_EXPERIENCIA = re.compile(r"sem experiencia|nao (e )?(exige|exigimos|necessari\w*|precisa)( de)? experiencia|experiencia nao (e )?(necessaria|obrigatoria|exigida)|primeiro emprego|nao precisa ter experiencia")
_FUNDAMENTAL = re.compile(r"ensino fundamental|fundamental (completo|incompleto)|\bfundamental\b")
_MEDIO = re.compile(r"ensino medio|medio (completo|incompleto|cursando)|\b2o grau\b|segundo grau")
_SUPERIOR = re.compile(r"(ensino )?superior completo|graduacao completa|graduad[oa] em|formacao superior|bacharel\w*|pos-?graduacao|curso superior completo")
_ANOS_EXP = re.compile(r"experiencia (minima )?de ([2-9]|\d{2}) anos|([2-9]|\d{2}) anos (ou mais )?de experiencia|minimo de ([2-9]|\d{2}) anos")
_REMOTO_TEXTO = re.compile(r"100% (remoto|home office)|trabalho remoto|home office integral|totalmente remot")


def _tem(texto_n, termos):
    """Algum termo aparece no texto (comparando do começo da palavra)."""
    return any(f" {normalizar(t)}" in f" {texto_n}" for t in termos)


def _primeiro(texto_n, termos):
    for t in termos:
        if f" {normalizar(t)}" in f" {texto_n}":
            return t
    return ""


def excluida(cfg, *textos):
    termos = cfg["filtro"].get("excluir_sempre", [])
    return bool(termos) and _tem(normalizar(" ".join(t or "" for t in textos)), termos)


def contrato(vaga):
    """(rótulo para o portal, motivo do corte ou '')."""
    t = (vaga.tipo or "").strip()
    if t in TIPOS_GUPY:
        return TIPOS_GUPY[t], ("" if TIPOS_GUPY[t] else f"contrato: {MOTIVO_TIPO_GUPY.get(t, t)}")
    if t.startswith("vacancy"):
        return "", ""    # tipo novo da Gupy que ainda não conhecemos: passa sem rótulo (o relatório mostra o código)
    n = normalizar(t)
    if re.search(r"estagi", n):
        return "", "contrato: estágio (exige matrícula em curso)"
    if re.search(r"trainee", n):
        return "", "contrato: trainee (exige ensino superior)"
    if re.search(r"\bpj\b|pessoa juridica|autonom|freelanc|cooperad|prestador", n):
        return "", "contrato: PJ/autônomo"
    if re.search(r"aprendiz", n):
        return "Jovem Aprendiz", ""
    if re.search(r"temporari", n):
        return "Temporário", ""
    if re.search(r"clt|efetiv", n):
        return "CLT", ""
    return t, ""     # não informado: passa (muitos cartões não dizem)


def precorte(vaga, cfg):
    """Cortes que não precisam da descrição (cidade, remoto, título). Usado para decidir se vale abrir a página da vaga."""
    f = cfg["filtro"]
    titulo_n = normalizar(vaga.cargo)
    if excluida(cfg, vaga.empresa, vaga.cargo, vaga.link):
        return f.get("excluir_sempre_motivo", "excluída")
    if not municipios.cidade_alvo(vaga.cidade):
        return f"fora da região ({vaga.cidade or 'cidade não informada'})"
    nivel = _primeiro(titulo_n, f.get("titulo_acima_da_entrada", []))
    if nivel and not _tem(titulo_n, f.get("titulo_acima_excecoes", [])):
        return f"título acima da entrada ({nivel})"
    if not _tem(titulo_n, f.get("titulo_entrada", [])):
        return "cargo fora das funções de entrada"
    return ""


def avaliar(vaga, cfg, hoje=None):
    """Aplica o filtro. Preenche vaga.nota, vaga.motivos, vaga.municipio, vaga.tipo (rótulo), experiencia e escolaridade.
    Devolve True se a vaga entra no portal."""
    f = cfg["filtro"]
    hoje = hoje or date.today()
    vaga.motivos = []
    texto_n = normalizar(f"{vaga.cargo} {vaga.descricao}")

    if excluida(cfg, vaga.empresa, vaga.cargo, vaga.descricao, vaga.link):
        vaga.motivos.append(f.get("excluir_sempre_motivo", "excluída"))
        return False
    golpe = _primeiro(texto_n, f.get("sinais_de_golpe", []))
    if golpe:
        vaga.motivos.append(f"sinal de golpe ({golpe})")
        return False
    corte = precorte(vaga, cfg)
    if corte:
        vaga.motivos.append(corte)
        return False
    if _REMOTO_TEXTO.search(texto_n) and not vaga.modelo.startswith("remote"):
        vaga.modelo = "remote"      # a descrição diz que é 100% remoto: marca (o portal mostra o aviso)
    rotulo, motivo = contrato(vaga)
    if motivo:
        vaga.motivos.append(motivo)
        return False
    vaga.tipo = rotulo
    if _SUPERIOR.search(texto_n) and not re.search(r"(nao|sem) (e )?(exige|necessari\w*|precisa)[^.]{0,30}superior", texto_n):
        vaga.motivos.append("exige ensino superior")
        return False
    if _ANOS_EXP.search(texto_n):
        vaga.motivos.append("exige anos de experiência")
        return False
    if vaga.prazo:
        try:
            if date.fromisoformat(vaga.prazo[:10]) < hoje:
                vaga.motivos.append(f"inscrições encerradas em {vaga.prazo[:10]}")
                return False
        except ValueError:
            pass

    vaga.municipio = municipios.cidade_alvo(vaga.cidade)
    if _SEM_EXPERIENCIA.search(texto_n):
        vaga.experiencia = "Sem experiência"
    if _FUNDAMENTAL.search(texto_n):
        vaga.escolaridade = "Ensino fundamental"
    elif _MEDIO.search(texto_n):
        vaga.escolaridade = "Ensino médio"

    nota, razoes = 5, []
    if vaga.experiencia:
        nota += 2; razoes.append("+2 sem experiência")
    if vaga.escolaridade == "Ensino fundamental":
        nota += 2; razoes.append("+2 ensino fundamental")
    elif vaga.escolaridade == "Ensino médio":
        nota += 1; razoes.append("+1 ensino médio")
    if vaga.tipo == "Jovem Aprendiz":
        nota += 1; razoes.append("+1 jovem aprendiz")
    if municipios.eh_do_programa(vaga.municipio):
        nota += 1; razoes.append("+1 município do programa")
    if _tem(texto_n, f.get("palavras_boas", [])):
        nota += 1; razoes.append("+1 benefícios/treinamento")
    if re.search(r"experiencia (minima )?de (6|seis) meses|experiencia (minima )?de (1|um) ano|experiencia comprovada|experiencia na funcao", texto_n):
        nota -= 2; razoes.append("-2 pede experiência")
    vaga.nota = max(0, min(10, nota))
    vaga.motivos.extend(razoes)
    if vaga.nota < f.get("nota_minima", 5):
        vaga.motivos.insert(0, f"nota abaixo de {f.get('nota_minima', 5)}")
        return False
    return True


CATEGORIAS_CORTE = ["fora da região", "contrato", "título acima da entrada", "cargo fora das funções de entrada",
                    "exige ensino superior", "exige anos de experiência", "sinal de golpe", "inscrições encerradas", "nota abaixo"]


def categoria_corte(motivos):
    m = motivos[0] if motivos else ""
    for c in CATEGORIAS_CORTE:
        if m.startswith(c):
            return c
    return m.split(" (")[0] or "outro"
