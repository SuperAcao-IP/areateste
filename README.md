# SuperAção SP — Portal de cursos e vagas

Portal de apoio ao programa **SuperAção SP** (Governo do Estado de São Paulo ·
Secretaria de Desenvolvimento Social · apoio técnico da FGV).

Voltado a supervisores e agentes do programa: a pessoa escolhe o município, vê no mapa
onde ficam os cursos e serviços, e navega pelos cursos e vagas de cada área de formação.

O **site** é estático puro (HTML, CSS e JavaScript, sem build), publicado no GitHub Pages.
Os **robôs** que mantêm os dados rodam sozinhos nas GitHub Actions (Node e Python); um deles
tem uma parte no computador da equipe (LinkedIn e Indeed).

---

## Rodar na sua máquina

O site busca arquivos com `fetch`, e o navegador bloqueia isso em `file://`: dois cliques
no `index.html` **não** funcionam direito. Precisa de um servidor local (Python já basta):

```bash
python -m http.server 8000        # Windows: py -m http.server 8000
```

E abrir <http://localhost:8000>. Para parar, `Ctrl+C`. O portal pede o e-mail institucional
(@fgv.br) na entrada.

---

## Estrutura

```
index.html            o portal
painel.html           painel de acompanhamento (uso, vazios, catálogo completo, histórico de cursos)
login.html            entrada com e-mail institucional
css/estilo.css        todo o visual do portal
img/                  logos do programa e da FGV
js/                   a aplicação
dados/                dados fixos e gerados pelos robôs (catálogos, mapa, vagas, histórico)
dados.json            cursos e vagas cadastrados à mão (antigo)
scripts/              robôs em Node (catálogos, mapa, Censo SUAS, histórico de cursos)
robo-vagas/           robô de vagas em Python (veja robo-vagas/README.md)
.github/workflows/    agendamento dos robôs
.claude/commands/     /buscar-linkedin-indeed (parte do robô de vagas no computador da equipe)
backup/               o index.html monolítico original, antes da separação
```

### Os arquivos de `js/`, na ordem em que carregam no `index.html`

A ordem **importa**, não embaralhe. Entre eles entram os arquivos de `dados/` e
`scripts/lib/regras.js` (regras de público, usadas também no navegador).

| Arquivo | O que faz |
|---|---|
| `auth.js` | Entrada por e-mail institucional (barreira de conveniência, não protege os dados) |
| `config.js` | URLs, chaves e as flags de liga/desliga de cada fonte. **Mexa aqui primeiro.** |
| `areas.js` | As 12 áreas do programa e o classificador por palavra-chave |
| `conectores.js` | Fontes externas: Trampolim (cursos e vagas), Sebrae, planilha (cursos e vagas), robô de vagas |
| `ui.js` | Estado da página, render da cidade, áreas, cartões, mapa e modal |
| `mapa-camadas.js` | Camadas do mapa (serviços, vagas, cursos presenciais, computador e internet) |
| `admin.js` | Formulário "Adicionar cursos e vagas aqui" (grava na planilha) |
| `app.js` | Ponto de entrada |
| `analytics.js` | Contagem anônima de uso (Worker da Cloudflare + D1) |
| `aviso.js` | Aviso de uso, uma vez por sessão |
| `historico-painel.js` | Só no `painel.html`: aba "Histórico de cursos e vagas" |
| `visao-geral.js` | Só no `painel.html`: aba "Visão geral" e vazios automáticos |
| `acessos-painel.js` | Só no `painel.html`: aba "Acessos" (lê a planilha pelo Apps Script, com a chave) |

---

## Os dois botões do canto

- **Adicionar cursos e vagas aqui** (amarelo): abre o formulário de cadastro, que grava
  direto na planilha do Google. Dá para cadastrar num município do programa ou numa
  **cidade próxima** (Rio Claro, Sorocaba, Piracicaba...): o item aparece para os
  municípios do programa vizinhos dela, e o formulário mostra para quais.
- **Administrativo** (azul): leva ao `painel.html`, que pede o e-mail institucional e a
  chave de acesso. Abas do painel:
  - **Visão geral**: números e gráficos (municípios sem busca, mapa, buscas por município e
    por área, uso/cursos/vagas por semana, cursos e vagas por município) e botão de imprimir;
  - **Uso do portal**: tabelas do uso no período (Worker de estatísticas);
  - **Vazios do catálogo**: retrato automático da semana (`dados/cobertura.json`) e, se quiser,
    a varredura ao vivo;
  - **Catálogo completo**: monta ao vivo; curso online conta uma vez só;
  - **Histórico de cursos e vagas**: tudo o que passou pelo portal, com filtros e CSV
    (cursos desde setembro de 2026; vagas desde novembro de 2026);
  - **Acessos**: quem entrou (e-mail, município, primeiro e último acesso), só com a chave do
    painel. Precisa do Apps Script v8 da planilha: veja [apps-script/LEIA-ME.md](apps-script/LEIA-ME.md).

> **Atenção:** o formulário de cadastro não tem senha própria. Quem entra no portal
> consegue cadastrar e excluir. Se o portal for divulgado publicamente, isso precisa mudar.

Se alguém apagar algo por engano: na planilha, **Arquivo → Histórico de versões**.

---

## De onde vêm os dados

| Fonte | Como chega | Atualização | Liga/desliga (`js/config.js`) |
|---|---|---|---|
| **Trampolim SP** — cursos | API ao vivo, via Worker da Cloudflare; filtro de perfil (regras de público + `dados/trampolim-decisoes.js`) | ao vivo | `TRAMPOLIM_ATIVO`, `FILTRAR_TRAMPOLIM` |
| **Trampolim SP** — vagas | mesma API, `type=vacancy` | ao vivo | `TRAMPOLIM_VAGAS_ATIVO` |
| **Robô de vagas** | Gupy, Catho, InfoJobs, vagas.com (e LinkedIn/Indeed), filtradas pelo perfil; a fechada sai (`dados/vagas-robo.json`) | segunda 9h | `VAGAS_ROBO_ATIVO` |
| **Sebrae SP** | GraphQL da loja (só cursos gratuitos) | ao vivo | `SEBRAE_ATIVO` |
| **Planilha** — cursos e vagas | Google Sheets publicado em CSV | ao vivo | `PLANILHA_ATIVA`, `PLANILHA_VAGAS_ATIVA` |
| **Catálogos online** (Aprenda Mais, EVG, Bradesco, +IFMG, Mundi) | listas em `dados/`, com filtro de público | segunda 6h | `FILTRAR_PUBLICO_FAMILIAS` |
| **Senai e Senac** (cursos presenciais) | site de cada um: unidades e cursos gratuitos/com bolsa (`dados/unidades.js`) | segunda 9h | `COLETAR_SENAC` no workflow do mapa |
| **Mapa** | aba `servicos` + Censo SUAS, unidades, bibliotecas, aba `pontos_digitais` | semanal / mensal | — |
| **Manuais** | `dados.json` | à mão | — |

Regras de conteúdo aplicadas a todas as fontes:

- **Carga mínima de 15 h** (`CARGA_MINIMA_H`) — cursos mais curtos não aparecem. Carga desconhecida passa.
- **Perfil do público** — os catálogos online e o Trampolim passam pelas regras de
  `scripts/lib/regras.js` (fica o tema que serve a famílias de baixa renda, em geral sem
  ensino médio completo). As vagas do robô passam pelo filtro de `robo-vagas/config.toml`.
- **Cidades vizinhas** (`CIDADES_VIZINHAS`) — quem seleciona Santa Gertrudes, Cordeirópolis
  ou Araras também vê o que há em Rio Claro, com um selo indicando a origem.
- **Cursos do Senac** abrem um aviso antes do link, lembrando de pedir bolsa ao supervisor.

Detalhes de cada robô: [ATUALIZACAO-CATALOGOS.md](ATUALIZACAO-CATALOGOS.md) (catálogos, mapa,
Censo SUAS, filtro do Trampolim, histórico) e [robo-vagas/README.md](robo-vagas/README.md).

---

## Os robôs (GitHub Actions)

| Workflow | Quando | O que faz |
|---|---|---|
| Atualizar catálogos | segunda 6h | Aprenda Mais, EVG (CSV oficial), Bradesco, +IFMG, Mundi |
| Atualizar mapa | segunda 9h | Senai e Senac (unidades e cursos), bibliotecas, coordenadas |
| Robô de vagas | segunda 9h | confere as vagas publicadas (a fechada sai) e busca novas |
| Uso semanal do portal | segunda 7h | números agregados de uso da semana (precisa do Secret `PAINEL_CHAVE`) |
| Histórico de cursos | segunda 10h | retrato semanal de cursos e vagas do portal e cobertura presencial |
| Atualizar Censo SUAS | mensal | CRAS e CREAS oficiais |

Cada um abre uma **issue** com o resumo e fecha a da semana anterior (só fica aberta a mais
recente). Todos podem rodar na hora pelo botão **Actions → (workflow) → Run workflow**.
Se uma fonte falhar, a versão anterior dela continua no ar.

**Secret `PAINEL_CHAVE`** (uma vez): a mesma chave do painel, cadastrada em Settings → Secrets and
variables → Actions, ou no terminal com `gh secret set PAINEL_CHAVE --repo SuperAcao-IP/areateste`.
Sem ele, o workflow de uso semanal só avisa; na primeira execução com a chave, reconstrói as 52
semanas anteriores.

A parte do LinkedIn e do Indeed roda no computador da equipe, por uma Tarefa do Windows
(segunda 9h). Instalação: [robo-vagas/INSTALAR.md](robo-vagas/INSTALAR.md).

---

## Publicar

O repositório de **homologação** (`areateste`) é onde se testa; o de **produção**
(`plataforma`) é o que vai ao ar.

```bash
git add .
git commit -m "descrição do que mudou"
git push
```

O GitHub Pages publica sozinho em um ou dois minutos. Três coisas que quebram no ar e
funcionam local:

1. **Caminhos relativos.** `href="css/estilo.css"` funciona; `href="/css/estilo.css"`
   não. O site fica em `usuario.github.io/repositorio/`, não na raiz do domínio.
2. **Maiúscula e minúscula.** O servidor do GitHub diferencia: `img/Logo.png` no HTML com
   o arquivo salvo como `logo.png` dá 404 publicado.
3. **O arquivo `.nojekyll`** na raiz precisa continuar existindo. O navegador também usa
   `scripts/lib/regras.js` e os arquivos de `dados/`, então essas pastas vão junto.

Se os cursos do Trampolim sumirem depois de publicar e aparecer erro de CORS no console,
o problema está no Worker da Cloudflare: ele precisa liberar a origem do GitHub Pages.

---

## Atualizar os dados fixos

- **Municípios:** `dados/municipios.js` (cidade que não estiver lá não aparece na lista).
  Cidades vizinhas: `CIDADES_VIZINHAS` em `js/config.js` (valem também para o robô de vagas
  e para o formulário de cadastro).
- **Áreas do programa:** `js/areas.js`. Curso que não casa com nenhuma área cai em "Outros".
- **Cursos do Trampolim a mostrar ou esconder:** `dados/trampolim-decisoes.js`.
- **Critérios das vagas:** `robo-vagas/config.toml`.
- **Cursos e vagas manuais:** planilha (pelo botão amarelo) ou `dados.json`.

---

## Coisas conhecidas, para depois

Nenhuma impede o portal de funcionar hoje:

- **Volume de requisições ao Worker.** Cada seleção de cidade faz dezenas de chamadas ao
  Trampolim (cursos e vagas, mais as cidades vizinhas). O Worker gratuito da Cloudflare
  aguenta algumas centenas de seleções por dia.
- **Sem timeout nas chamadas ao vivo.** Se uma API travar, aquela fonte fica carregando;
  as outras aparecem normalmente.
- **Os conectores repetem muito código** (Trampolim, Sebrae, planilha). Unificar num
  contrato só é o refactor que mais reduziria código.
- **A exclusão no formulário identifica a linha por `{curso, município}`.** Sem um id
  estável, dois cursos de mesmo nome no mesmo município podem fazer apagar o errado.
- **Senac:** os termos de uso do site pedem autorização por escrito para acesso automatizado.
  A coleta foi ligada por decisão da equipe; o recomendado é pedir essa autorização.

---

## Contato

`faleconoscosuperacaosp@fgv.br` · WhatsApp (11) 92140-9019
