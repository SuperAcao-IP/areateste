# SuperAção SP — Portal de cursos e vagas

Portal de apoio ao programa **SuperAção SP** (Governo do Estado de São Paulo ·
Secretaria de Desenvolvimento Social · apoio técnico da FGV).

Voltado a supervisores e agentes do programa: a pessoa escolhe o município, vê no mapa
onde ficam os cursos e serviços, e navega pelos cursos e vagas de cada área de formação.

Site estático puro — HTML, CSS e JavaScript. Sem build, sem Node, sem servidor.
Publicado no GitHub Pages.

---

## Rodar na sua máquina

O site busca o `dados.json` com `fetch`, e o navegador bloqueia isso em `file://`.
Ou seja: dois cliques no `index.html` **não** funciona direito. Precisa de um servidor
local. O macOS já vem com Python, então não instala nada:

```bash
python3 -m http.server 8000
```

E abrir <http://localhost:8000>. Para parar, `Ctrl+C`.

---

## Estrutura

```
index.html            marcação da página
css/estilo.css        todo o visual
img/                  logos do programa e da FGV
dados/                dados fixos (mapa, catálogos EVG e Bradesco)
js/                   a aplicação
dados.json            cursos e vagas cadastrados à mão
backup/               o index.html monolítico original, antes da separação
```

### Os arquivos de `js/`, na ordem em que carregam

A ordem no `index.html` **importa** — não embaralhe.

| Arquivo | O que faz |
|---|---|
| `config.js` | URLs, chaves e as flags de liga/desliga de cada fonte. **Mexa aqui primeiro.** |
| `areas.js` | As 12 áreas do programa e o classificador por palavra-chave |
| `conectores.js` | As cinco fontes externas de cursos e vagas |
| `ui.js` | Estado da página, render da cidade, áreas, cartões, mapa e modal |
| `admin.js` | Painel de cadastro manual |
| `app.js` | Ponto de entrada — precisa ser o último |

### Por que os dados estão em `.js` e não em `.json`

`dados/mapa-pontos.js`, `dados/cursos-evg.js` e `dados/cursos-bradesco.js` são arquivos
`.js` com um `const` dentro, não JSON. O código usa essas constantes de forma síncrona
na inicialização (`MUNICIPIOS = Object.keys(MAPA)`). Virar JSON obrigaria a
inicialização a virar assíncrona. Não vale a complicação agora.

---

## De onde vêm os dados

| Fonte | Como chega | Liga/desliga em `config.js` |
|---|---|---|
| **Trampolim SP** — cursos | API ao vivo, via Worker da Cloudflare | `TRAMPOLIM_ATIVO` |
| **Trampolim SP** — vagas | mesma API, `type=vacancy` | `TRAMPOLIM_VAGAS_ATIVO` |
| **Sebrae SP** | GraphQL da loja (só cursos gratuitos, 10 h+) | `SEBRAE_ATIVO` |
| **Planilha** — cursos | Google Sheets publicado em CSV | `PLANILHA_ATIVA` |
| **Planilha** — vagas | mesma planilha, outra aba | `PLANILHA_VAGAS_ATIVA` |
| **EVG e Bradesco** | listas fixas em `dados/` | — |
| **Manuais** | `dados.json` | — |
| **Mapa** | `dados/mapa-pontos.js`, do My Maps de campo | — |

Regras de conteúdo aplicadas a todas as fontes (também em `config.js`):

- **Carga mínima de 10 h** — cursos mais curtos não aparecem. Carga desconhecida passa.
- **Cidades vizinhas** — quem seleciona Santa Gertrudes, Cordeirópolis ou Araras também
  vê os cursos presenciais de Rio Claro, com um selo indicando a origem.
- **Cursos do Senac** abrem um aviso antes do link, lembrando de pedir bolsa ao
  supervisor.

---

## Publicar

O repositório de **homologação** é onde se testa; o de **produção** é o que vai ao ar.

```bash
git add .
git commit -m "descrição do que mudou"
git push
```

O GitHub Pages publica sozinho em um ou dois minutos.

Três coisas que quebram no ar e funcionam local — vale conferir antes de subir:

1. **Caminhos relativos.** `href="css/estilo.css"` funciona; `href="/css/estilo.css"`
   não. O site fica em `usuario.github.io/repositorio/`, não na raiz do domínio.
2. **Maiúscula e minúscula.** O macOS não diferencia, o servidor do GitHub diferencia.
   `img/Logo.png` no HTML com o arquivo salvo como `logo.png` dá 404 publicado.
3. **O arquivo `.nojekyll`** na raiz precisa continuar existindo.

Se os cursos do Trampolim sumirem depois de publicar e aparecer erro de CORS no console,
o problema está no Worker da Cloudflare — ele precisa liberar a origem do GitHub Pages.

---

## Cadastrar curso ou vaga na mão

Pelo botão **Administração** no canto da página. O que é cadastrado ali vai direto para
a planilha do Google e aparece para todo mundo.

Cursos que vêm do Trampolim, Sebrae, EVG e Bradesco são carregados ao vivo das
plataformas oficiais e **não podem ser editados nem removidos por ali**.

> **Atenção:** o painel não tem senha. Qualquer pessoa que abra o portal consegue
> cadastrar e excluir. É uma decisão consciente para esta fase de MVP — se o portal for
> divulgado publicamente, isso precisa mudar.

### Se alguém apagar algo por engano

A planilha do Google guarda histórico: **Arquivo → Histórico de versões → Ver histórico
de versões**. Dá para restaurar qualquer estado anterior.

---

## Atualizar os dados fixos

- **Pontos do mapa:** exportar o My Maps em KML, converter e substituir o conteúdo de
  `dados/mapa-pontos.js`. A lista de municípios do seletor sai daqui — cidade que não
  estiver no mapa não aparece na lista.
- **Áreas do programa:** `js/areas.js`. Cada área tem nome, descrição, ícone e a lista de
  palavras-chave que classifica os cursos automaticamente. Curso que não casa com
  nenhuma cai em "Outros".
- **Catálogos EVG e Bradesco:** `dados/cursos-evg.js` e `dados/cursos-bradesco.js`.
- **Cursos e vagas manuais:** `dados.json`.

---

## Coisas conhecidas, para depois

Nenhuma impede o portal de funcionar hoje. Ficam registradas para não se perderem:

- **Volume de requisições.** Cada seleção de cidade dispara até ~300 chamadas — o
  Trampolim pagina de 10 em 10 até 80 páginas, duas vezes, mais as cidades vizinhas.
  Quase todas passam pelo Worker gratuito da Cloudflare, cujo limite dá para umas 400
  seleções de cidade por dia. É o que vai aparecer primeiro com muita gente testando junto.
- **Sem timeout nas chamadas.** Se uma API travar, a tela fica em "Carregando…" sem
  mensagem de erro.
- **Os cinco conectores são o mesmo código copiado cinco vezes** (~120 linhas cada).
  Unificar num contrato só é o refactor que mais reduziria código.
- **A exclusão no admin identifica a linha por `{curso, município}`.** Sem um id estável,
  dois cursos de mesmo nome no mesmo município podem fazer apagar o errado.
- Leaflet vem de CDN sem versão travada · `console.log` de diagnóstico ligado em
  produção · sem testes automatizados.

---

## Contato

`faleconoscosuperacaosp@fgv.br` · WhatsApp (11) 92140-9019
