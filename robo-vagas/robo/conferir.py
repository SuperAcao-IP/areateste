"""Conferência semanal das vagas que estão no portal: a vaga fechada sai.

Uma vaga é dada como FECHADA quando:
  - a página responde 404 ou 410;
  - o site redireciona a vaga para a lista/página inicial (é o que Gupy, Catho e InfoJobs fazem com vaga encerrada);
  - a página diz que a vaga foi encerrada, expirou ou não recebe mais candidaturas;
  - o prazo de inscrição passou;
  - ou ela está no portal há mais de `dias_max` dias (config.toml, [conferir]).
Página que pede verificação anti-robô ou que não responde fica como INCERTA: a vaga continua (até o teto de dias).
Também tira as vagas que passaram a cair em `excluir_sempre`.

Rodar sozinho:  python -m robo.conferir            (confere e grava)
                python -m robo.conferir --simular  (só mostra)"""
import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

from . import filtro, portal
from .fontes import UA, _BLOQUEIO
from .texto import normalizar

FECHADA = re.compile(
    r"vaga (foi )?(encerrada|finalizada|expirada|fechada|preenchida|cancelada)"
    r"|nao (esta|estamos|estao) mais (disponive\w*|recebendo|aceitando)"
    r"|(vaga|oportunidade|pagina) nao (esta mais |foi )?(disponivel|encontrada)"
    r"|esta vaga (ja )?(foi encerrada|expirou|nao existe|nao esta disponivel)"
    r"|(inscricoes|candidaturas) (foram |estao )?encerradas"
    r"|processo seletivo (foi )?encerrado|oportunidade (foi )?encerrada|vaga expirada|anuncio expirado"
    r"|no longer accepting applications|this job is no longer available|job (has )?expired|position has been filled"
)


class _SemRedirecionar(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _abrir(url, timeout=30):
    """(status, endereço final, texto). Segue até 5 redirecionamentos guardando o destino; 4xx não levanta exceção."""
    opener = urllib.request.build_opener(_SemRedirecionar)
    atual = url
    for _ in range(6):
        req = urllib.request.Request(atual, headers={"User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "pt-BR,pt;q=0.9"})
        try:
            with opener.open(req, timeout=timeout) as r:
                return r.status, atual, r.read(800_000).decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
                atual = urllib.parse.urljoin(atual, e.headers["Location"])
                continue
            corpo = ""
            try:
                corpo = e.read(200_000).decode("utf-8", errors="replace")
            except Exception:
                pass
            return e.code, atual, corpo
    return 0, atual, ""


def _virou_lista(original, final):
    """O endereço final é a lista de vagas ou a página inicial, e não mais a vaga."""
    a, b = urllib.parse.urlsplit(original), urllib.parse.urlsplit(final)
    if portal.chave(original) == portal.chave(final):
        return False
    caminho = b.path.rstrip("/")
    if caminho in ("", "/jobs", "/vagas", "/pt", "/en"):
        return True
    if re.search(r"vagas-de-emprego|/vagas-de-|/busca|/search|/jobs/?$|error|nao-encontrad|not-found|expirad", final, re.I):
        return True
    return a.netloc == b.netloc and len(caminho) < len(a.path.rstrip("/")) // 2


def _texto_visivel(html_):
    """Texto da página sem <script> e <style>: os sites guardam ali as traduções ("vaga encerrada", "não encontrado"...)
    de todas as telas, inclusive de vaga aberta."""
    return normalizar(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)\b.*?</\1>", " ", html_[:600000], flags=re.S | re.I)))


def _vaga_gupy(html_):
    """Os dados da vaga que a página da Gupy traz (props.pageProps.job), ou None."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html_, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))["props"]["pageProps"]["job"] or None
    except (ValueError, KeyError, TypeError):
        return None


def _data_passou(iso, hoje):
    try:
        return bool(iso) and date.fromisoformat(str(iso)[:10]) < hoje
    except ValueError:
        return False


def situacao(a, cfg, hoje=None, abrir=_abrir):
    """('aberta' | 'fechada' | 'incerta', motivo)."""
    hoje = hoje or date.today()
    c = cfg.get("conferir", {})
    if filtro.excluida(cfg, a.get("empresa"), a.get("cargo"), a.get("link")):
        return "fechada", "caiu em excluir_sempre"
    if a.get("prazo"):
        try:
            if date.fromisoformat(a["prazo"][:10]) < hoje:
                return "fechada", f"prazo de inscrição passou ({a['prazo'][:10]})"
        except ValueError:
            pass
    try:
        dias = (hoje - date.fromisoformat(a.get("entrou_em", "")[:10])).days
    except ValueError:
        dias = 0
    if dias > c.get("dias_max", 60):
        return "fechada", f"{dias} dias no portal (teto de {c.get('dias_max', 60)})"
    try:
        status, final, texto = abrir(a["link"])
    except Exception as e:
        return "incerta", f"não abriu ({str(e)[:80]})"
    if status in (404, 410):
        return "fechada", f"página respondeu {status}"
    if status == 0 or status >= 500:
        return "incerta", f"site respondeu {status or 'sem resposta'}"
    visivel = _texto_visivel(texto)
    if _BLOQUEIO.search(texto[:20000]) and not FECHADA.search(visivel):
        return "incerta", "o site pediu verificação anti-robô"
    if "gupy.io" in urllib.parse.urlsplit(a["link"]).netloc:
        if "/candidates/signin" in final:
            return "fechada", "a Gupy não acha mais a vaga (mandou para o login)"
        job = _vaga_gupy(texto)
        if job:
            if job.get("status") and job["status"] != "published":
                return "fechada", f"a Gupy diz que a vaga está '{job['status']}'"
            if _data_passou(job.get("expiresAt"), hoje) or _data_passou(job.get("registerEndDate"), hoje):
                return "fechada", "o prazo da vaga na Gupy passou"
            return "aberta", ""
    if re.search(r"/(login|signin|entrar|authwall)\b", final, re.I) and portal.chave(final) != portal.chave(a["link"]):
        return "incerta", "o site pediu login para mostrar a vaga"
    if _virou_lista(a["link"], final):
        return "fechada", "o site mandou para a lista de vagas"
    if FECHADA.search(visivel):
        return "fechada", "a página diz que a vaga foi encerrada"
    if status >= 400:
        return "incerta", f"página respondeu {status}"
    return "aberta", ""


def conferir(cfg, hoje=None, simular=False, log=print, abrir=_abrir, pausa=None):
    """Confere todas as ativas. Devolve (fechadas, incertas, abertas) como listas de (vaga, motivo)."""
    hoje = hoje or date.today()
    pausa = cfg.get("conferir", {}).get("pausa", 2) if pausa is None else pausa
    ativas = portal.ler_ativas()
    fechadas, incertas, abertas, ficam = [], [], [], []
    for i, a in enumerate(ativas):
        estado, motivo = situacao(a, cfg, hoje, abrir)
        if estado == "fechada":
            fechadas.append((a, motivo))
        else:
            a["conferida_em"] = hoje.isoformat()
            ficam.append(a)
            (incertas if estado == "incerta" else abertas).append((a, motivo))
        if pausa and i < len(ativas) - 1 and "dias no portal" not in motivo and "prazo" not in motivo:
            time.sleep(pausa)
    log(f"Conferência: {len(abertas)} abertas, {len(fechadas)} fechadas (saem do portal), {len(incertas)} incertas (ficam)")
    if not simular:
        portal.salvar_ativas(ficam)
    return fechadas, incertas, abertas


def main(argv=None):
    from .buscar import carregar_config
    ap = argparse.ArgumentParser()
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args(argv)
    fechadas, incertas, _ = conferir(carregar_config(), simular=a.simular)
    for v, m in fechadas:
        print(f"FECHADA  {v['cargo']} · {v['empresa']} · {m} · {v['link']}")
    for v, m in incertas:
        print(f"INCERTA  {v['cargo']} · {v['empresa']} · {m} · {v['link']}")
    if not a.simular:
        portal.exportar()


if __name__ == "__main__":
    main()
