"""Rotina semanal do robô de vagas do SuperAção SP (GitHub Actions, segunda às 9h):

  1. confere as vagas que já estão no portal e tira as fechadas (robo/conferir.py);
  2. busca vagas novas: Gupy em cada município do programa e nas vizinhas; Catho, InfoJobs e vagas.com nas cidades-polo;
  3. filtra pelo perfil do programa (robo/filtro.py);
  4. publica: vagas/ativas.json -> dados/vagas-robo.json (o portal lê esse arquivo);
  5. escreve o relatório (relatorios/AAAA-MM-DD-busca.md) e, se houver Secrets do Gmail, manda o resumo por e-mail.

Não se candidata a nada. Só encontra, filtra, publica e confere.

Rodar:  python -m robo.buscar                  (tudo, com e-mail se configurado)
        python -m robo.buscar --sem-email
        python -m robo.buscar --so-conferir     (só tira as fechadas e regrava o arquivo do portal)
        python -m robo.buscar --cidades 2       (teste rápido: só as 2 primeiras cidades)
"""
import argparse
import json
import os
import sys
import tomllib
from datetime import date

from . import RAIZ, conferir, filtro, fontes, municipios, portal, registro, status_fontes


def carregar_config():
    with (RAIZ / "config.toml").open("rb") as f:
        return tomllib.load(f)


def _cel(x):
    return str(x or "-").replace("|", "/").replace("\n", " ")


def montar_relatorio(hoje, aprovadas, descartadas, avisos, por_fonte, fechadas, incertas, total_portal, funil):
    L = [f"# Robô de vagas · {hoje}", ""]
    L.append(f"**{len(aprovadas)} vagas novas no portal** · {len(fechadas)} fechadas saíram · **{total_portal} vagas no portal agora**")
    L.append("")
    L.append("| Fonte | Situação | Lidas | Aprovadas | Principais cortes |")
    L.append("|---|---|---|---|---|")
    for nome, (status, achadas, motivo) in por_fonte.items():
        cortes = ", ".join(f"{c}: {n}" for c, n in sorted(funil.get(nome, {}).items(), key=lambda x: -x[1])[:4])
        aprov = sum(1 for v in aprovadas if v.plataforma == nome)
        L.append(f"| {nome} | {status}{(': ' + _cel(motivo)) if motivo else ''} | {len(achadas)} | {aprov} | {_cel(cortes)} |")
    L.append("")
    if aprovadas:
        L.append("## Vagas novas")
        L.append("")
        L.append("| Nota | Cargo | Empresa | Cidade (aparece em) | Contrato | Fonte | Link |")
        L.append("|---|---|---|---|---|---|---|")
        for v in sorted(aprovadas, key=lambda x: (x.municipio, -x.nota)):
            L.append("| " + " | ".join(_cel(c) for c in (v.nota, v.cargo, v.empresa, v.municipio, v.tipo, v.plataforma, v.link)) + " |")
        L.append("")
    if fechadas:
        L.append("## Saíram do portal (fechadas)")
        L.append("")
        for a, motivo in fechadas[:80]:
            L.append(f"- {a['cargo']} · {a['empresa']} · {a['municipio']}: {motivo}")
        if len(fechadas) > 80:
            L.append(f"- … e mais {len(fechadas) - 80}")
        L.append("")
    if incertas:
        L.append(f"## Não deu para conferir ({len(incertas)}, continuam no portal)")
        L.append("")
        for a, motivo in incertas[:30]:
            L.append(f"- {a['cargo']} · {a['empresa']}: {motivo}")
        L.append("")
    if descartadas:
        L.append("## Descartadas (amostra, para calibrar o filtro)")
        L.append("")
        for v in descartadas[:25]:
            L.append(f"- {v.cargo} · {v.empresa} · {v.cidade}: {v.motivos[0] if v.motivos else ''}")
        L.append("")
    if avisos:
        L.append("## Avisos")
        L.append("")
        L.extend(f"- {a}" for a in avisos)
    return "\n".join(L) + "\n"


def montar_email(hoje, aprovadas, fechadas, total_portal, avisos):
    L = [f"Robô de vagas do SuperAção SP, {hoje}.", "",
         f"{len(aprovadas)} vaga(s) nova(s) no portal, {len(fechadas)} fechada(s) saíram, {total_portal} no portal agora.", ""]
    for v in sorted(aprovadas, key=lambda x: (x.municipio, -x.nota)):
        L.append(f"{v.cargo}, {v.empresa} ({v.municipio}; {v.tipo or 'contrato não informado'}; {v.plataforma})")
        L.append(v.link)
        L.append("")
    if avisos:
        L.append("Avisos:")
        L.extend(avisos)
    return "\n".join(L)


def cidades_gupy(cfg):
    prog = sorted(municipios.programa(), key=municipios.normalizar)
    if not cfg["local"].get("gupy_incluir_vizinhas", True):
        return prog
    return municipios.todas_as_cidades()


def buscar_tudo(cfg, log=print, limite_cidades=None):
    """Lê todas as fontes. Devolve (candidatas, por_fonte, avisos)."""
    desativadas = set(cfg["busca"].get("fontes_desativadas", []))
    candidatas, por_fonte, avisos = [], {}, []

    if "Gupy" not in desativadas:
        erros, achadas = [], []
        cidades = cidades_gupy(cfg)[:limite_cidades]
        for cidade in cidades:
            achadas += fontes.buscar_gupy(cfg["busca"]["termos_gupy"], cidade=cidade, estado=cfg["local"]["estado_gupy"],
                                          max_paginas=cfg["busca"].get("max_paginas_gupy", 2), log=log, erros=erros)
        if not achadas:
            avisos.append("Gupy não retornou nada (fora do ar ou mudou o formato).")
        por_fonte["Gupy"] = ("OK" if achadas or not erros else "ERRO", achadas,
                             f"{len(erros)} buscas falharam (ex.: {erros[0]})" if erros else "")
        candidatas += achadas

    links_antes, pares_antes = registro.chaves_existentes(registro.ler())

    def vale_abrir(v):
        """Só abre a página da vaga (para ler descrição e contrato) se ela é inédita e não cai já pelo título ou pela cidade."""
        return not registro.ja_vista(v, links_antes, pares_antes) and not filtro.precorte(v, cfg)

    n_termos = cfg["busca"].get("max_termos_por_cidade", 4)
    polos = cfg["local"].get("cidades_polo", [])[:limite_cidades]
    for nome, buscar_portal, termos in (("Catho", fontes.buscar_catho, cfg["busca"]["termos_portais"]),
                                        ("InfoJobs", fontes.buscar_infojobs, cfg["busca"]["termos_portais"]),
                                        ("vagas.com", fontes.buscar_vagas_com, cfg["busca"]["termos_vagas_com"])):
        if nome in desativadas:
            continue
        achadas, erro = [], ""
        for cidade in polos:
            try:
                achadas += buscar_portal(termos[:n_termos], vale_abrir, log=log, local=fontes.locais_portais(cidade, cfg["local"].get("uf", "sp"))[nome])
            except Exception as e:
                erro = str(e)[:150]
                log(f"  {nome} falhou em {cidade}: {e}")
                if "429" in erro or isinstance(e, fontes.PortalBloqueado):
                    avisos.append(f"{nome}: o site recusou em {cidade} ({erro}); parei esta fonte para não insistir")
                    break
        por_fonte[nome] = ("ERRO" if erro and not achadas else "OK", achadas, erro)
        candidatas += achadas
    return candidatas, por_fonte, avisos


def avaliar_candidatas(candidatas, cfg, hoje=None):
    """Tira repetidas e já vistas, aplica o filtro. Devolve (aprovadas, descartadas, funil por fonte)."""
    linhas = registro.ler()
    links, pares = registro.chaves_existentes(linhas)
    aprovadas, descartadas, funil, vistas = [], [], {}, set()
    for v in candidatas:
        k = portal.chave(v.link)
        if k in vistas or registro.ja_vista(v, links, pares):
            funil.setdefault(v.plataforma, {}).setdefault("repetida", 0)
            funil[v.plataforma]["repetida"] += 1
            continue
        vistas.add(k)
        pares.add(registro.par_empresa_cargo(v.empresa, v.cargo))   # mesma empresa e mesmo cargo em outra cidade: só a primeira
        if filtro.avaliar(v, cfg, hoje):
            aprovadas.append(v)
        else:
            cat = filtro.categoria_corte(v.motivos)
            funil.setdefault(v.plataforma, {}).setdefault(cat, 0)
            funil[v.plataforma][cat] += 1
            descartadas.append(v)
    return aprovadas, descartadas, funil


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-email", action="store_true")
    ap.add_argument("--so-conferir", action="store_true")
    ap.add_argument("--sem-conferir", action="store_true")
    ap.add_argument("--cidades", type=int, default=None, help="teste: só as N primeiras cidades")
    ap.add_argument("--relatorio", default="", help="copia o relatório para este arquivo (usado pela issue do GitHub)")
    args = ap.parse_args(argv)

    cfg = carregar_config()
    hoje = date.today().isoformat()
    log = print

    fechadas, incertas = [], []
    if not args.sem_conferir:
        log("Conferindo as vagas que estão no portal...")
        fechadas, incertas, _ = conferir.conferir(cfg, log=log)

    aprovadas, descartadas, por_fonte, avisos, funil = [], [], {}, [], {}
    if not args.so_conferir:
        log("Buscando vagas novas...")
        candidatas, por_fonte, avisos = buscar_tudo(cfg, log=log, limite_cidades=args.cidades)
        aprovadas, descartadas, funil = avaliar_candidatas(candidatas, cfg)
        for nome, (status, achadas, motivo) in por_fonte.items():
            status_fontes.registrar(nome, status, len(achadas), motivo, aprovadas=sum(1 for v in aprovadas if v.plataforma == nome),
                                    funil=funil.get(nome, {}))
        # vão para o histórico as aprovadas e as cortadas por título/requisito (as de fora da região não poluem o histórico)
        registraveis = [v for v in descartadas if v.motivos and not v.motivos[0].startswith(("fora da região", "trabalho remoto"))]
        registro.acrescentar([(v, "nova") for v in aprovadas] + [(v, "descartada") for v in registraveis], hoje)
        portal.acrescentar(aprovadas, hoje)
        descartadas = registraveis

    total = portal.exportar(hoje=hoje)
    log(f"{len(aprovadas)} novas · {len(fechadas)} fechadas saíram · {total} vagas no portal")

    rel = montar_relatorio(hoje, aprovadas, descartadas, avisos, por_fonte, fechadas, incertas, total, funil)
    pasta = RAIZ / "relatorios"
    pasta.mkdir(exist_ok=True)
    (pasta / f"{hoje}-busca.md").write_text(rel, encoding="utf-8")
    if args.relatorio:
        with open(args.relatorio, "w", encoding="utf-8") as f:
            f.write(rel)
    log(f"relatorios/{hoje}-busca.md")

    saida = os.environ.get("GITHUB_OUTPUT")
    if saida:
        erros = [n for n, (s, a, _) in por_fonte.items() if s == "ERRO"]
        with open(saida, "a", encoding="utf-8") as f:
            f.write(f"novas={len(aprovadas)}\nfechadas={len(fechadas)}\ntotal={total}\nfontes_com_falha={', '.join(erros)}\n")

    if args.sem_email or not cfg.get("relatorio", {}).get("email_resumo"):
        return
    sys.path.insert(0, str(RAIZ / "scripts"))
    from enviar_email import enviar, ler_env
    env = ler_env()
    destino = env.get("EMAIL_DESTINO") or os.environ.get("EMAIL_DESTINO")
    if not (destino and (env.get("GMAIL_USER") or os.environ.get("GMAIL_USER"))):
        log("e-mail não enviado: Secrets GMAIL_USER / GMAIL_APP_PASSWORD / EMAIL_DESTINO não configurados (só a issue)")
        return
    try:
        enviar(destino, f"Robô de vagas {hoje}: {len(aprovadas)} nova(s), {total} no portal", montar_email(hoje, aprovadas, fechadas, total, avisos))
        log("resumo enviado por e-mail")
    except Exception as e:
        log(f"e-mail de resumo não enviado: {e}")


if __name__ == "__main__":
    main()
