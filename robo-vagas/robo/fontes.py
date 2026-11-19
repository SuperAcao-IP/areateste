"""De onde as vagas vêm: Gupy (API pública do portal) e as páginas públicas de busca da Catho, do InfoJobs e do vagas.com.
Nenhuma fonte usa login. Se um site pedir verificação anti-robô, a fonte para e avisa (não se contorna bloqueio)."""
import html
import json
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from .texto import normalizar

UA = "Mozilla/5.0 (robo-vagas; busca de vagas)"
GUPY_API = "https://portal.gupy.io/api/job-search/jobs"  # endereço usado pelo portal.gupy.io


@dataclass
class Vaga:
    empresa: str
    cargo: str
    link: str
    plataforma: str
    cidade: str = ""
    estado: str = ""
    modelo: str = ""          # hybrid / on-site / remote / texto livre
    tipo: str = ""            # tipo de contrato (Gupy) ou regime (planilha)
    descricao: str = ""
    prazo: str = ""
    publicada: str = ""
    nota: int = 0
    motivos: list = field(default_factory=list)
    salario: str = ""
    municipio: str = ""       # município do portal (do programa ou cidade vizinha) a que a vaga pertence; o filtro preenche
    experiencia: str = ""     # "Sem experiência" quando a vaga diz que não exige; o portal destaca
    escolaridade: str = ""    # "Ensino fundamental" ou "Ensino médio" quando a vaga diz; o portal mostra e filtra


def _get(url: str, tentativas: int = 3) -> bytes:
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/csv,*/*"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            if i == tentativas - 1:
                raise
            time.sleep(3 * (i + 1))


# ---------------------------------------------------------------- Gupy
def _limpar_html(texto: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", texto or "")).split())


def _link_gupy(j: dict) -> str:
    """A API devolve /job/<base64>?...; usamos /jobs/<id>, o mesmo formato já gravado no CSV (evita repetir vaga)."""
    partes = urllib.parse.urlsplit(j.get("jobUrl") or "")
    if not partes.netloc:
        return ""
    if j.get("id"):
        return f"{partes.scheme}://{partes.netloc}/jobs/{j['id']}"
    return f"{partes.scheme}://{partes.netloc}{partes.path}"


def _vaga_gupy(j: dict) -> Vaga:
    return Vaga(
        empresa=(j.get("careerPageName") or "").strip(),
        cargo=" ".join((j.get("name") or "").split()),
        link=_link_gupy(j),
        plataforma="Gupy",
        cidade=(j.get("city") or "").strip(),
        estado=(j.get("state") or "").strip(),
        modelo=j.get("workplaceType") or "",
        tipo=j.get("type") or "",
        descricao=_limpar_html(j.get("description")),
        prazo=(j.get("applicationDeadline") or "")[:10],
        publicada=(j.get("publishedDate") or "")[:10],
    )


def buscar_gupy(termos, cidade="", estado="", limite_por_pagina=100, max_paginas=3, log=print, erros=None):
    """Busca cada termo em todas as páginas (até max_paginas). A API aceita no máximo 100 por página."""
    vistas, vagas = set(), []
    for termo in termos:
        total = novas = 0
        for pagina in range(max_paginas):
            params = {"jobName": termo, "limit": limite_por_pagina, "offset": pagina * limite_por_pagina}
            if estado:
                params["state"] = estado
            if cidade:
                params["city"] = cidade
            try:
                dados = json.loads(_get(f"{GUPY_API}?" + urllib.parse.urlencode(params)))
            except Exception as e:
                log(f"  ⚠️ Gupy falhou para '{termo}': {e}")
                if erros is not None:
                    erros.append(f"{termo}: {e}")
                break
            itens = dados.get("data", []) if isinstance(dados, dict) else []
            total += len(itens)
            for j in itens:
                v = _vaga_gupy(j)
                if v.link and v.link not in vistas:
                    vistas.add(v.link)
                    vagas.append(v)
                    novas += 1
            time.sleep(1)  # educado com o servidor
            if len(itens) < limite_por_pagina:
                break
        log(f"  Gupy '{termo}': {total} resultados ({novas} inéditas nesta busca)")
    return vagas


# ---------------------------------------------------------------- Portais públicos: Catho e InfoJobs
PAUSA_PORTAIS = 3         # segundos entre requisições
PAUSA_VAGAS_COM = 8       # o vagas.com respondeu 429 com 3 s: pausa maior
MAX_DETALHES_PORTAL = 40  # páginas de vaga abertas por fonte em cada execução; o resto fica para o dia seguinte
_BLOQUEIO = re.compile(r"captcha|cf-chl|just a moment|access denied|attention required|incapsula|datadome", re.I)
CATHO = "https://www.catho.com.br"
INFOJOBS = "https://www.infojobs.com.br"


class PortalBloqueado(Exception):
    """O site recusou a leitura. A busca da fonte para aqui: não se contorna bloqueio."""


def _pagina_portal(url):
    try:
        conteudo = _get(url, tentativas=1).decode("utf-8", errors="replace")
    except Exception as e:
        raise PortalBloqueado(f"{e}") from e
    if _BLOQUEIO.search(conteudo[:20000]) and "<article" not in conteudo and "js_vacancyLoad" not in conteudo and "JobPosting" not in conteudo:
        raise PortalBloqueado("o site pediu verificação anti-robô")
    return conteudo


def _texto_html(trecho):
    sem_atributos = re.sub(r'\s(?:data-bs-)?title="[^"]*"', "", trecho)
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", sem_atributos)).split())


def ler_detalhe_vaga(pagina):
    """Lê a vaga do JSON JobPosting da página: (descrição, prazo, modelo, tipo de contrato)."""
    descricao = prazo = modelo = ""
    for bloco in re.findall(r"<script[^>]*ld\+json[^>]*>(.*?)</script>", pagina, re.S):
        try:
            dados = json.loads(bloco, strict=False)
        except ValueError:
            continue
        if isinstance(dados, dict) and dados.get("@type") == "JobPosting":
            descricao = _limpar_html(dados.get("description"))
            prazo = (dados.get("validThrough") or "")[:10]
            if dados.get("jobLocationType") == "TELECOMMUTE":
                modelo = "remote"
            break
    corpo = _texto_html(re.sub(r"<(script|style)\b.*?</\1>", " ", pagina, flags=re.S))
    m = re.search(r"Tipo de contrato(?: e Jornada)?\s*:?\s*(.{1,25})", corpo)
    tipo = m.group(1).strip() if m else ""
    if re.search(r"tempor[aá]ri", tipo, re.I):
        tipo = "temporário"
    return descricao, prazo, modelo, tipo


def ler_cartoes_catho(pagina):
    vagas = []
    for m in re.finditer(r'<li data-offer-item="(\d+)"(.*?)</article>', pagina, re.S):
        bloco = m.group(2)
        link = re.search(r'<a href="(/vagas/[^"]+)"[^>]*>(.*?)</a>', bloco, re.S)
        if not link:
            continue
        empresa = re.search(r'<span class="text-12">(.*?)</span>', bloco, re.S)
        cidade = re.search(r"</strong>\s*-\s*([^<]+?)\s*</p>", bloco)
        salario = re.search(r'i_salary"></span>\s*<strong>(.*?)</strong>', bloco, re.S)
        valor = _texto_html(salario.group(1)) if salario else ""
        nome = _texto_html(empresa.group(1)) if empresa else ""
        if not nome.strip("* "):   # a Catho esconde o nome com asteriscos
            nome = "Empresa confidencial"
        vagas.append(Vaga(
            empresa=nome,
            cargo=_texto_html(link.group(2)), link=CATHO + link.group(1), plataforma="Catho",
            cidade=html.unescape(cidade.group(1)).strip() if cidade else "", estado="SP",
            salario="" if "combinar" in valor.lower() else valor))
    return vagas


_MODELOS_INFOJOBS = {"presencial": "on-site", "híbrido": "hybrid", "hibrido": "hybrid", "home office": "remote", "remoto": "remote"}


def ler_cartoes_infojobs(pagina):
    vagas = []
    inicios = list(re.finditer(r'<div id="vacancy(\d+)"', pagina))
    for i, m in enumerate(inicios):
        bloco = pagina[m.start():inicios[i + 1].start() if i + 1 < len(inicios) else len(pagina)]
        link = re.search(r'data-href="(/vaga-[^"]+)"', bloco)
        titulo = re.search(r"js_vacancyTitle[^>]*>(.*?)</h2>", bloco, re.S)
        if not link or not titulo:
            continue
        limpo = re.sub(r'\s(?:data-bs-)?title="[^"]*"', "", bloco)
        depois = limpo[limpo.find("</h2>"):]
        empresa = re.search(r'<div class="text-body">(.*?)</div>', depois, re.S)
        texto = _texto_html(depois)
        cidade = re.search(r">\s*([^<>]{2,50}?)\s*-\s*([A-Z]{2})\s*(?:<[^>]+>\s*)*,", depois)
        salario = re.search(r"R\$ ?[\d.,]+(?: a R\$ ?[\d.,]+)?", texto)
        modelo = re.search(r"\b(Presencial|Híbrido|Hibrido|Home Office|Remoto)\b", texto)
        nome = _texto_html(empresa.group(1)) if empresa else ""
        nome = re.sub(r"\s*Este selo.*$", "", nome).strip()
        if not nome:   # empresa sem página própria: vem em texto logo depois da data
            nome = "Empresa confidencial" if "confidencial" in texto.lower() else ""
        vagas.append(Vaga(
            empresa=nome, cargo=_texto_html(titulo.group(1)), link=INFOJOBS + link.group(1), plataforma="InfoJobs",
            cidade=html.unescape(cidade.group(1)).strip() if cidade else "", estado=cidade.group(2) if cidade else "",
            modelo=_MODELOS_INFOJOBS.get(modelo.group(1).lower(), "") if modelo else "", salario=salario.group(0) if salario else ""))
    return vagas


def _url_catho(termo, local="sao-paulo-sp"):
    slug = re.sub(r"[^a-z0-9]+", "-", normalizar(termo)).strip("-")
    return f"{CATHO}/vagas/{slug}/{local}/"


def _url_infojobs(termo, local="sao-paulo,-sp"):
    return f"{INFOJOBS}/vagas-de-emprego-{urllib.parse.quote_plus(termo)}-em-{local}.aspx"


VAGAS_COM = "https://www.vagas.com.br"
def _tipo_pelo_nivel(nivel_txt):
    """O vagas.com mostra o nível no cartão: aprendiz vira Jovem Aprendiz (serve ao programa); estágio e trainee saem como regime, para o filtro cortar."""
    if re.search(r"aprendiz", nivel_txt, re.I):
        return "Jovem Aprendiz"
    if re.search(r"est[aá]gio", nivel_txt, re.I):
        return "Estágio"
    if re.search(r"trainee", nivel_txt, re.I) and not re.search(r"j[uú]nior", nivel_txt, re.I):   # "Júnior/Trainee" é o nível de entrada genérico
        return "Trainee"
    return ""


def ler_cartoes_vagas_com(pagina):
    """Cartões da busca do vagas.com.br (HTML puro)."""
    vagas = []
    for m in re.finditer(r'<li class="vaga[^"]*">(.*?)</li>', pagina, re.S):
        bloco = m.group(1)
        link = re.search(r'<a class="link-detalhes-vaga"[^>]*?(?:title="([^"]*)")?[^>]*href="(/vagas/v\d+/[^"]+)"', bloco, re.S)
        if not link:
            continue
        titulo = re.search(r'class="link-detalhes-vaga"[^>]*>(.*?)</a>', bloco, re.S)
        empresa = re.search(r'<span class="emprVaga">(.*?)</span>', bloco, re.S)
        nivel = re.search(r'<span class="nivelVaga">(.*?)</span>', bloco, re.S)
        # a cidade pode vir marcada (<mark>Campinas</mark> / SP) quando o termo buscado é o nome dela
        local = re.search(r'class="vaga-local">\s*<i[^>]*></i>(.*?)(?:<div|</div>)', bloco, re.S)
        resumo = re.search(r'<div class="detalhes">(.*?)</div>', bloco, re.S)
        publicada = re.search(r'class="data-publicacao">.*?(\d{2})/(\d{2})/(\d{4})', bloco, re.S)
        cidade, uf = (_texto_html(local.group(1)).split("/") + [""])[:2] if local else ("", "")
        nome = _texto_html(empresa.group(1)) if empresa else ""
        nivel_txt = _texto_html(nivel.group(1)) if nivel else ""
        vagas.append(Vaga(
            empresa="Empresa confidencial" if nome.lower() in ("", "confidencial") else nome, cargo=_texto_html(titulo.group(1)) if titulo else html.unescape(link.group(1) or ""),
            link=VAGAS_COM + link.group(2), plataforma="vagas.com", cidade=cidade.strip(), estado=uf.strip(),
            tipo=_tipo_pelo_nivel(nivel_txt),
            publicada=f"{publicada.group(3)}-{publicada.group(2)}-{publicada.group(1)}" if publicada else "",
            descricao=_texto_html(resumo.group(1))[:600] + (f" Nível: {nivel_txt}." if nivel_txt else "") if resumo else ""))
    return vagas


def ler_detalhe_vagas_com(pagina):
    """JobPosting da página (descrição e prazo) mais o "Regime CLT" do painel lateral."""
    descricao, prazo, modelo, _ = ler_detalhe_vaga(pagina)
    corpo = _texto_html(re.sub(r"<(script|style).*?</>", " ", pagina, flags=re.S))
    m = re.search(r"Regime\s+(CLT|PJ|Est[aá]gio|Tempor[aá]rio|Aprendiz|Freelancer|Aut[oô]nomo|Cooperado|Trainee|Terceiro)", corpo, re.I)
    return descricao, prazo, modelo, m.group(1) if m else ""


def _url_vagas_com(termo, local="sao-paulo"):
    slug = re.sub(r"[^a-z0-9]+", "-", normalizar(termo)).strip("-")
    return f"{VAGAS_COM}/vagas-de-{slug}-em-{local}"


def slug_cidade(cidade):
    """'Santa Bárbara d'Oeste' -> 'santa-barbara-d-oeste' (o formato que os três portais usam nos endereços de busca)."""
    return re.sub(r"[^a-z0-9]+", "-", normalizar(cidade)).strip("-")


def locais_portais(cidade, uf="sp"):
    """Endereço da cidade em cada portal: Catho 'campinas-sp', InfoJobs 'campinas,-sp', vagas.com 'campinas'."""
    s = slug_cidade(cidade)
    return {"Catho": f"{s}-{uf}", "InfoJobs": f"{s},-{uf}", "vagas.com": s}


def _buscar_portal(nome, termos, url_de, ler_cartoes, precisa_detalhe, log=print, pausa=PAUSA_PORTAIS, max_detalhes=MAX_DETALHES_PORTAL, ler_detalhe=None):
    """Primeira página de cada termo; abre a vaga só se `precisa_detalhe` disser que vale a pena.
    Se o site recusar, para e avisa, sem insistir."""
    vistas, vagas, detalhes = set(), [], 0
    for termo in termos:
        try:
            cartoes = ler_cartoes(_pagina_portal(url_de(termo)))
        except PortalBloqueado as e:
            if not vagas:
                raise
            log(f"  {nome}: o site recusou em '{termo}' ({str(e)[:60]}); paro aqui sem insistir e fico com as {len(vagas)} vagas já lidas")
            break
        time.sleep(pausa)
        novas = 0
        for v in cartoes:
            if v.link in vistas:
                continue
            vistas.add(v.link)
            if precisa_detalhe(v):
                if detalhes >= max_detalhes:
                    continue
                detalhes += 1
                descricao, v.prazo, modelo, tipo = (ler_detalhe or ler_detalhe_vaga)(_pagina_portal(v.link))
                v.descricao, v.tipo, v.modelo = descricao or v.descricao, tipo or v.tipo, modelo or v.modelo
                time.sleep(pausa)
            vagas.append(v)
            novas += 1
        log(f"  {nome} '{termo}': {len(cartoes)} resultados ({novas} inéditas nesta busca)")
    return vagas


def buscar_catho(termos, precisa_detalhe=lambda v: True, log=print, pausa=PAUSA_PORTAIS, local="sao-paulo-sp"):
    return _buscar_portal("Catho", termos, lambda t: _url_catho(t, local), ler_cartoes_catho, precisa_detalhe, log, pausa)


def buscar_infojobs(termos, precisa_detalhe=lambda v: True, log=print, pausa=PAUSA_PORTAIS, local="sao-paulo,-sp"):
    return _buscar_portal("InfoJobs", termos, lambda t: _url_infojobs(t, local), ler_cartoes_infojobs, precisa_detalhe, log, pausa)


def buscar_vagas_com(termos, precisa_detalhe=lambda v: True, log=print, pausa=PAUSA_VAGAS_COM, local="sao-paulo"):
    return _buscar_portal("vagas.com", termos, lambda t: _url_vagas_com(t, local), ler_cartoes_vagas_com, precisa_detalhe, log, pausa, ler_detalhe=ler_detalhe_vagas_com)
