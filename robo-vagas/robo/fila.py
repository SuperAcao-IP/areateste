"""Comandos curtos para o Claude (comando /buscar-linkedin-indeed) sem ler nem editar os arquivos inteiros.

  python -m robo.fila listar --limite 20
  python -m robo.fila registrar --plataforma "LinkedIn vagas" --empresa X --cargo Y --link URL --cidade "Campinas" --descricao "..."
  python -m robo.fila fonte --nome "LinkedIn vagas" --status OK --vagas 12
  python -m robo.fila exportar          (regrava dados/vagas-robo.json com as vagas ativas)

A vaga registrada passa pelo MESMO filtro das outras fontes; se passar, já entra nas ativas do portal."""
import argparse
import tomllib
from datetime import date

from . import RAIZ, filtro, portal, registro, status_fontes
from .fontes import Vaga
from .texto import normalizar

_MODELOS = {"hibrido": "hybrid", "presencial": "on-site", "remoto": "remote", "hybrid": "hybrid", "on-site": "on-site", "remote": "remote"}


def _config():
    with (RAIZ / "config.toml").open("rb") as f:
        return tomllib.load(f)


def registrar(linhas, cfg, plataforma, empresa, cargo, link, cidade="", modelo="", tipo="", descricao="", salario="", prazo="", hoje=None):
    """Passa uma vaga achada pelo Claude no filtro. Devolve (resultado, motivo, vaga)."""
    v = Vaga(empresa=empresa, cargo=cargo, link=link, plataforma=plataforma, cidade=cidade, estado="SP",
             modelo=_MODELOS.get(normalizar(modelo), normalizar(modelo)), tipo=tipo, descricao=descricao, prazo=prazo, salario=salario)
    links, pares = registro.chaves_existentes(linhas)
    if registro.ja_vista(v, links, pares):
        return "JA_VISTA", "", v
    passou = filtro.avaliar(v, cfg, hoje)
    linha = {c: "" for c in registro.COLUNAS}
    linha.update(data=(hoje or date.today()).isoformat(), empresa=empresa, cargo=cargo, plataforma=plataforma, link=link,
                 modelo=registro.MODELO_PT.get(v.modelo, v.modelo), nota=str(v.nota), status="nova" if passou else "descartada",
                 observacao="; ".join(v.motivos), cidade=cidade, municipio=v.municipio, tipo=v.tipo, prazo=prazo, salario=salario)
    linhas.append(linha)
    if passou:
        return "NOVA", "; ".join(v.motivos), v
    return "DESCARTADA", v.motivos[0] if v.motivos else "", v


def main(argv=None):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("listar")
    p.add_argument("--limite", type=int, default=20)
    p = sub.add_parser("registrar")
    for campo in ("--plataforma", "--empresa", "--cargo", "--link", "--cidade"):
        p.add_argument(campo, required=True)
    for campo in ("--modelo", "--tipo", "--descricao", "--salario", "--prazo"):
        p.add_argument(campo, default="")
    p = sub.add_parser("fonte")
    p.add_argument("--nome", required=True, choices=status_fontes.FONTES)
    p.add_argument("--status", required=True, choices=["OK", "ERRO"])
    p.add_argument("--vagas", type=int, default=0)
    p.add_argument("--motivo", default="")
    sub.add_parser("exportar")
    a = ap.parse_args(argv)

    cfg = _config()
    registro._migrar()
    if a.cmd == "listar":
        ativas = sorted(portal.ler_ativas(), key=lambda x: x.get("entrou_em", ""), reverse=True)[:a.limite]
        print(f"{len(portal.ler_ativas())} vaga(s) no portal; as {len(ativas)} mais recentes:")
        for x in ativas:
            print(" | ".join([x.get("entrou_em", ""), x["municipio"], x["cargo"], x["empresa"], x.get("tipo", ""), x["fonte"], x["link"]]))
    elif a.cmd == "registrar":
        linhas = registro.ler()
        resultado, motivo, v = registrar(linhas, cfg, a.plataforma, a.empresa, a.cargo, a.link, a.cidade,
                                         a.modelo, a.tipo, a.descricao, a.salario, a.prazo)
        if resultado != "JA_VISTA":
            registro.salvar(linhas)
        if resultado == "NOVA":
            portal.acrescentar([v])
        fonte = "LinkedIn vagas" if "LinkedIn" in a.plataforma else a.plataforma
        if fonte in status_fontes.FONTES:
            categoria = {"JA_VISTA": "repetida", "DESCARTADA": filtro.categoria_corte([motivo])}.get(resultado)
            status_fontes.contar(fonte, categoria, aprovada=resultado == "NOVA")
        print(f"{resultado}: {motivo}" if resultado == "DESCARTADA" else resultado)
    elif a.cmd == "exportar":
        print(f"{portal.exportar()} vagas gravadas em dados/vagas-robo.json")
    else:
        status_fontes.registrar(a.nome, a.status, a.vagas, a.motivo)
        print(f"OK: {a.nome} {a.status}")


if __name__ == "__main__":
    main()
