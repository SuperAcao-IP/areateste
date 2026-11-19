# Instalar o robô de vagas no computador da equipe (LinkedIn e Indeed)

> **Para o Claude que está lendo isto:** siga os passos em ordem, um por vez, e mostre à pessoa o que aconteceu em cada um.
> Nunca peça, digite ou grave senha, código de verificação ou CAPTCHA: quando um passo pedir login, **a pessoa** faz.

A maior parte do robô roda sozinha no GitHub toda segunda às 9h: Gupy, Catho, InfoJobs e vagas.com, com a conferência das vagas fechadas. Este computador só cuida do **LinkedIn** (pelo Chrome) e do **Indeed** (pelo conector do Claude). Uma Tarefa do Windows abre o Claude Code toda segunda às 9h, roda o comando `/buscar-linkedin-indeed` e publica as vagas novas no portal.

---

## 0. Baixar o repositório (se ainda não estiver no computador)
A pessoa abriu o Claude Code numa pasta qualquer e pediu para seguir este arquivo. Se `git` não existir, instale primeiro:
```powershell
winget install --id Git.Git --exact --silent --accept-package-agreements --accept-source-agreements
winget install --id GitHub.cli --exact --silent --accept-package-agreements --accept-source-agreements
```
Feche e abra o PowerShell (ou recarregue o PATH) e:
```powershell
gh auth login          # a PESSOA faz o login: GitHub.com, HTTPS, "Login with a web browser"
gh repo clone SuperAcao-IP/areateste C:\superacao\areateste
cd C:\superacao\areateste
```

## 1. Instalar o que falta e agendar a tarefa
```powershell
powershell -ExecutionPolicy Bypass -File robo-vagas\instalar.ps1
```
Ele confere e, se faltar, instala pelo `winget`: Git, GitHub CLI, Python 3.12, Node.js e Claude Code. Depois roda os testes do robô e agenda a tarefa **"SuperAcao - Robo de vagas (LinkedIn e Indeed)"** para toda segunda às 9h (se o computador estiver desligado, ela roda assim que ligar).
Se ele parar pedindo `gh auth login`, a pessoa faz o login e roda o script de novo.

## 2. E-mail do robô no LinkedIn (a pessoa faz)
1. No Chrome deste computador, a pessoa entra em linkedin.com com o **e-mail novo criado para o robô** e marca "manter conectado".
2. Confere que a extensão **Claude in Chrome** está instalada e conectada à mesma conta do Claude Code (chromewebstore: "Claude in Chrome").
3. No Claude Code, `/mcp` deve mostrar o conector **Indeed** conectado (se não, a pessoa conecta em claude.ai → Configurações → Conectores).

## 3. Primeira execução, com a pessoa olhando
```powershell
powershell -ExecutionPolicy Bypass -File robo-vagas\rodar-linkedin.ps1
```
- Deu certo: o log (`robo-vagas\relatorios\AAAA-MM-DD-linkedin.log`) mostra vagas `NOVA`/`DESCARTADA`, e no fim "Publicando as vagas no GitHub".
- **Se o modo sem janela não conseguir usar o Chrome** (o log diz que a ferramenta do Chrome não está disponível): reagende no modo interativo. Toda segunda o Claude Code abre com o comando pronto, e a pessoa só aperta Enter:
  ```powershell
  powershell -ExecutionPolicy Bypass -File robo-vagas\instalar.ps1 -Interativo
  ```

## 4. Conferir no portal
Abra o portal, escolha uma cidade-polo (ex.: Campinas) e veja a seção de vagas: as do robô aparecem com "via LinkedIn vagas" ou "via Indeed" ao lado da empresa.

## 5. (Opcional) Resumo semanal por e-mail
O robô do GitHub já abre uma issue com o resumo toda segunda. Para receber também por e-mail, **a pessoa** cria uma senha de app no Gmail do robô (myaccount.google.com/apppasswords; precisa da verificação em duas etapas ligada) e cadastra os três Secrets, digitando ela mesma quando o terminal pedir:
```powershell
gh secret set GMAIL_USER --repo SuperAcao-IP/areateste
gh secret set GMAIL_APP_PASSWORD --repo SuperAcao-IP/areateste
gh secret set EMAIL_DESTINO --repo SuperAcao-IP/areateste
```

---

## Se precisar mexer depois
| Quer… | Onde |
|---|---|
| mudar termos, cidades-polo, o que corta | `robo-vagas/config.toml` |
| tirar uma vaga do portal | termo dela em `excluir_sempre` (`config.toml`); sai na segunda seguinte, ou rode `python robo-vagas/fila.py exportar` depois de `python -m robo.conferir` em `robo-vagas/` |
| mudar o dia/horário da tarefa | Agendador de Tarefas do Windows, ou edite `instalar.ps1` e rode de novo |
| desligar a tarefa | `Unregister-ScheduledTask -TaskName "SuperAcao - Robo de vagas (LinkedIn e Indeed)"` |
