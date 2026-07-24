# SuperAção SP — Plano de organização do repositório

> **Escopo (rev. 3).** Manter simples ao extremo. Trabalhar com o que já existe.
> Continua sendo site estático no GitHub Pages, sem build, sem npm, sem VM, sem custo.
> O objetivo desta rodada é **um só**: separar o monolito em arquivos e escrever um
> README. Otimização, robustez e eficiência ficam para depois.

---

## 1. O problema

Um `index.html` de 1.960 linhas e 243 KB com CSS, marcação e JavaScript no mesmo arquivo.

Metade do peso está em **duas linhas**: o logo PNG em base64 (35 KB, linha 440) e o
`const MAPA` com as coordenadas por município (87 KB, linha 624). Enquanto elas
existirem, nenhum diff é revisável e qualquer edição é feita às cegas.

Não é repositório git — não há histórico nem como desfazer.

---

## 2. A estrutura

Plana e óbvia. Sem `src/`, sem subpastas aninhadas, sem configuração.

```
superacao-sp/
├─ index.html           só marcação
├─ README.md
├─ dados.json           cursos e vagas manuais (hoje o código busca e não acha)
├─ apps-script.gs       o backend da planilha, versionado
├─ backup/
│  └─ index-monolito.html
├─ css/
│  └─ estilo.css
├─ img/
│  └─ logo-superacao.png
├─ dados/
│  ├─ mapa-pontos.js    os 87 KB (`const MAPA = {...}`)
│  ├─ cursos-evg.js     (`const EVG = [...]`)
│  └─ cursos-bradesco.js (`const EV = [...]`)
└─ js/
   ├─ config.js         URLs, flags, constantes
   ├─ areas.js          taxonomia + palavras-chave do classificador
   ├─ conectores.js     Trampolim, Sebrae, planilhas
   ├─ ui.js             render da cidade, áreas, cartões, mapa, modal
   ├─ admin.js          painel administrativo
   └─ app.js            amarra tudo e inicia
```

Onze arquivos. Continua abrindo direto no navegador e publicando com um `git push`.

---

## 3. `<script>` normal, não ES modules

Decisão que economiza trabalho e evita quebrar coisa.

O código atual usa handlers inline na marcação — `onclick="window.print()"` e
`onclick="...window._abrirModalSenac(...)"`. Com `<script type="module">` as funções
deixam de ser globais e **esses handlers param de funcionar**. Daria para consertar,
mas é trabalho sem retorno agora.

Com `<script>` comuns na ordem certa, o escopo global continua sendo o mesmo de hoje.
Isso significa que a separação é **recortar e colar** — nenhuma linha de lógica muda:

```html
<script src="dados/mapa-pontos.js"></script>
<script src="dados/cursos-evg.js"></script>
<script src="dados/cursos-bradesco.js"></script>
<script src="js/config.js"></script>
<script src="js/areas.js"></script>
<script src="js/conectores.js"></script>
<script src="js/ui.js"></script>
<script src="js/admin.js"></script>
<script src="js/app.js"></script>
```

A ordem é a mesma em que o código aparece hoje no arquivo. Mantendo a ordem, funciona
igual.

**Os dados vão em `.js`, não em `.json`.** A linha 1479 faz
`const MUNICIPIOS = Object.keys(MAPA)` de forma síncrona, e `montarChips()` roda logo
depois. Se `MAPA` virar um `.json` buscado com `fetch`, a inicialização precisa virar
assíncrona — e aí não é mais recortar e colar. Arquivo `.js` com o `const` dentro
resolve: mesma legibilidade, mesmo diff limpo, zero mudança de lógica.

---

## 4. Os passos

### Passo 0 — git · 10 min
`git init`, commit do monolito intocado, cópia em `backup/index-monolito.html`.
Rede de segurança de tudo que vem depois.

### Passo 1 — tirar o peso morto · 30 min
Base64 → `img/logo-superacao.png`. `MAPA` → `dados/mapa-pontos.js`.
`EVG` e `EV` → `dados/cursos-evg.js` e `dados/cursos-bradesco.js` (ver seção 3:
arquivos `.js` com o `const` dentro, não `.json`).

*Maior ganho da lista: o `index.html` cai de 243 KB para ~50 KB e volta a ser legível.*

### Passo 2 — CSS para fora · 15 min
As linhas 22–423 viram `css/estilo.css`, com um `<link>` no lugar. Recorte direto.
Se der vontade de quebrar em três arquivos por tema, tudo bem — mas um só já resolve.

### Passo 3 — JS para fora · 1 h
As linhas 570–1945 viram os seis arquivos de `js/`, na mesma ordem. Recorte direto,
sem reescrever nada. Mover o modal Senac (linhas 1946–1959) para antes dos scripts.

### Passo 4 — criar o `dados.json` · 15 min
O `carregarDados()` (linha 632) busca esse arquivo, não acha e cai no `catch` desde
sempre — os cursos e vagas manuais **nunca aparecem**. Criar com a estrutura que o
código já espera:

```json
{ "cursos": [], "vagas": [] }
```

### Passo 5 — README · 30 min
O que é o portal, de onde vêm os dados (as cinco fontes), como rodar local, como
publicar, como atualizar o catálogo, e como reverter uma bobagem na planilha pelo
histórico de versões do Google Sheets.

O bloco *"Para a equipe: como atualizar os dados deste portal"* que hoje mora no
rodapé da página migra para cá — é documentação de manutenção, não conteúdo de site.

**Total: uma tarde.**

---

## 5. Rodar local

O `dados.json` é buscado com `fetch`, e o navegador bloqueia `fetch` em `file://`.
Então para testar não basta dar dois cliques no arquivo — precisa de um servidor.
O macOS já tem Python, então não instala nada:

```bash
python3 -m http.server 8000
```

E abrir `http://localhost:8000`. O resto do site funciona em `file://`; só o
`dados.json` que não.

---

## 6. Publicar no GitHub Pages

Site estático puro: o `git push` publica direto, sem build e sem custo. Quatro
detalhes que precisam estar certos, senão funciona local e quebra no ar.

**O primeiro deploy não é só `push`.** Precisa criar o repositório no GitHub e ligar
o Pages em *Settings → Pages → Source: Deploy from a branch → `main` / `(root)`*.
Depois disso, todo push publica sozinho em um ou dois minutos.

**Caminhos relativos, sempre.** O endereço será
`https://<usuario>.github.io/<repositorio>/`, então `href="css/estilo.css"` funciona e
`href="/css/estilo.css"` quebra. O `fetch("dados.json")` do código já é relativo — está
certo do jeito que está.

**Maiúscula e minúscula importam.** O macOS não diferencia; o servidor do Pages, que é
Linux, diferencia. `img/Logo.png` no HTML com o arquivo salvo como `logo.png` funciona
na sua máquina e dá 404 publicado. É o erro mais comum dessa migração.

**Criar um arquivo `.nojekyll` vazio na raiz.** O Pages roda Jekyll por padrão, que
ignora arquivos e pastas começando com `_`. Nossa estrutura não tem nenhum, mas o
arquivo custa nada e evita surpresa futura.

Dois pontos que **já estão resolvidos** no código atual, vale saber por quê:

- **Mixed content:** o Pages serve em HTTPS e recusa recurso em HTTP. Todas as chamadas
  externas (Leaflet, Google Fonts, Worker do Trampolim, Sebrae, Sheets, Apps Script) já
  são HTTPS.
- **CORS do Apps Script:** o `POST` do admin usa `Content-Type: text/plain` de
  propósito — isso faz dele uma *simple request*, sem preflight. Funciona cross-origin.

**O único a verificar de fato:** o Worker do Trampolim
(`trampolim-proxy.beatrizgribas.workers.dev`) precisa devolver
`Access-Control-Allow-Origin: *`. Se ele tiver sido escrito liberando só `localhost`
ou uma origem específica, os cursos do Trampolim vão falhar publicados e funcionar
local. Não dá para saber daqui — está no código do Worker, na conta Cloudflare dela.
Se der erro de CORS no console depois do deploy, é isso.

**Repositório público.** Pages em repositório privado exige plano pago. Público não
muda a exposição do que já existe — a URL do Apps Script está no fonte da página e
qualquer visitante já a enxerga hoje.

---

## 7. Checklist depois de cada passo

Abrir o site e conferir contra `backup/index-monolito.html`:

1. Select de municípios preenchido e ordenado.
2. Selecionar cidade → painel monta.
3. Mapa renderiza com os três tipos de pino.
4. Grade de áreas com a contagem certa; clicar abre o painel com os cartões.
5. Cursos das fontes externas chegam depois e atualizam a grade.
6. Curso Senac abre o modal de bolsa; os demais abrem em aba nova.
7. Painel admin abre, lista, salva e exclui.

---

## 8. Fica para depois

Anotado para não se perder, **fora do escopo desta rodada**:

- **Volume de requisições.** Cada seleção de cidade dispara até ~300 requisições
  (o Trampolim pagina de 10 em 10 até 80 páginas, duas vezes, mais cidades vizinhas),
  quase todas pelo Worker gratuito da Cloudflare — cujo limite é ~400 seleções de
  cidade por dia. É o que vai aparecer primeiro quando muita gente testar junto.
- **Sem timeout nos `fetch`.** Se a API engasgar, a tela fica em "Carregando…" para
  sempre, sem mensagem de erro.
- **Cinco conectores copiados cinco vezes** — ~120 linhas quase idênticas cada.
  Unificar num contrato só é o refactor que mais reduz código, quando for a hora.
- **Painel admin sem autenticação.** Decidido que fica assim no MVP. Se o portal for
  divulgado publicamente, a conversa volta.
- **Exclusão do admin por `{curso, município}`** — sem id estável, homônimos podem
  fazer apagar a linha errada.
- Leaflet via CDN sem versão travada · `console.log` ligado em produção · sem testes.
