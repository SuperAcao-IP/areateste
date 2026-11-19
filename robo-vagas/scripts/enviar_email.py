#!/usr/bin/env python3
"""Envia o resumo da busca por e-mail pelo Gmail (só texto, sem anexo).

Uso de teste:
  python scripts/enviar_email.py --para voce@exemplo.com --assunto Teste --corpo teste.txt --teste   (só mostra)
  python scripts/enviar_email.py --para voce@exemplo.com --assunto Teste --corpo teste.txt           (envia)

Credenciais: arquivo .env na raiz (no computador) ou variáveis de ambiente
GMAIL_USER / GMAIL_APP_PASSWORD / NOME_REMETENTE (no GitHub Actions, vêm dos Secrets).
"""
import argparse
import os
import re
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TIMEOUT = 30


def ler_env():
    env = {}
    arq = RAIZ / ".env"
    if arq.exists():
        for linha in arq.read_text(encoding="utf-8-sig").splitlines():
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    # O .env vale mais que o ambiente; no GitHub Actions não há .env e os valores vêm dos Secrets.
    for k in ("GMAIL_USER", "GMAIL_APP_PASSWORD", "NOME_REMETENTE"):
        if not env.get(k) and os.environ.get(k):
            env[k] = os.environ[k]
    return env


def senha_limpa(senha):
    """Tira espaços e aspas. Levanta erro, sem mostrar o valor, se não parecer uma senha de app do Google."""
    limpa = re.sub(r"[\s\"']", "", senha or "")
    if not re.fullmatch(r"[A-Za-z]{16}", limpa):
        raise RuntimeError(f"senha de app inválida: precisa de 16 letras e tem {len(limpa)} caracteres")
    return limpa


def _conectar_587():
    s = smtplib.SMTP("smtp.gmail.com", 587, timeout=TIMEOUT)
    try:
        s.starttls(context=ssl.create_default_context())
    except Exception:
        s.close()
        raise
    return s


def _conectar_465():
    return smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=TIMEOUT)


def _enviar_smtp(usuario, senha, msg):
    """Tenta 587 (STARTTLS) e depois 465 (SSL). Senha recusada não é problema de porta: não tenta de novo."""
    erros = []
    for nome, conectar in (("587", _conectar_587), ("465", _conectar_465)):
        try:
            s = conectar()
        except (OSError, smtplib.SMTPException) as e:
            erros.append(f"porta {nome}: {type(e).__name__}")
            continue
        try:
            s.login(usuario, senha)
            s.send_message(msg)
            s.quit()
            return
        except smtplib.SMTPAuthenticationError:
            s.close()
            raise RuntimeError("o Gmail recusou o usuário ou a senha de app")
        except (OSError, smtplib.SMTPException) as e:
            s.close()
            erros.append(f"porta {nome}: {type(e).__name__}")
    raise RuntimeError("não consegui enviar pelo Gmail (" + "; ".join(erros) + ")")


def montar(para, assunto, corpo, env=None):
    env = env if env is not None else ler_env()
    remetente = env.get("GMAIL_USER", "")
    nome = env.get("NOME_REMETENTE", "Robô de vagas")
    msg = EmailMessage()
    msg["From"] = f"{nome} <{remetente}>" if remetente else nome
    msg["To"] = para.strip()
    msg["Subject"] = assunto.strip()
    msg.set_content(corpo)
    return msg


def enviar(para, assunto, corpo):
    """Usada pelo robo/buscar.py. Levanta erro se faltar credencial."""
    env = ler_env()
    if not env.get("GMAIL_USER") or not env.get("GMAIL_APP_PASSWORD"):
        raise RuntimeError("faltam GMAIL_USER e GMAIL_APP_PASSWORD (.env ou Secrets)")
    _enviar_smtp(env["GMAIL_USER"], senha_limpa(env["GMAIL_APP_PASSWORD"]), montar(para, assunto, corpo, env))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--para", required=True)
    p.add_argument("--assunto", required=True)
    p.add_argument("--corpo", required=True, help="caminho de um .txt com o texto do e-mail")
    p.add_argument("--teste", action="store_true")
    a = p.parse_args()
    if "@" not in a.para or " " in a.para.strip():
        sys.exit(f"ERRO: e-mail de destino inválido: {a.para}")
    corpo = Path(a.corpo).read_text(encoding="utf-8").strip()
    if a.teste:
        msg = montar(a.para, a.assunto, corpo)
        print(f"---- TESTE (não enviado) ----\nDe: {msg['From']}\nPara: {msg['To']}\nAssunto: {msg['Subject']}\n\n{corpo}")
        return
    try:
        enviar(a.para, a.assunto, corpo)
    except RuntimeError as e:
        sys.exit(f"ERRO: {e}")
    print(f"ENVIADO para {a.para}: {a.assunto}")


if __name__ == "__main__":
    main()
