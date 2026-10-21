# Atualização dos catálogos fixos (automática)

Catálogos, **na ordem de prioridade para repetidos**: **Aprenda Mais** (MEC), **+IFMG**,
**Mundi** (IFSul), **Bradesco** (Escola Virtual da Fundação Bradesco) e **EVG**
(Escola Virtual de Governo). Arquivos em `dados/`.

Um curso que aparece em mais de uma fonte fica **uma vez só**, na de maior prioridade
(o automático das fontes abaixo é escondido; decisão manual nunca é escondida por repetição,
por isso o Excel na Prática continua nos dois, como combinado). Vale só entre cursos online.

Uma GitHub Action roda **toda segunda-feira** (06h em Brasília) e também a qualquer hora
pelo botão *Actions → Atualizar catálogos → Run workflow*. Ninguém precisa aprovar nada:
ela coleta, filtra, confere os links, publica na `main` e, quando algo mudou ou falhou,
abre uma **issue** com o resumo.

## O que acontece em cada execução

1. **Coleta** os três sites (`scripts/lib/coletores.js`), sem login.
   - *Aprenda Mais:* lê as categorias de topo do portal, que guardam a **turma vigente**
     (as antigas ficam em "Turmas anteriores"). A turma é descoberta a cada vez pelo
     "- Turma 2026B" no título; cada turma tem links novos. A carga horária real sai de
     `course/info.php` de cada curso.
   - *EVG:* percorre `escolavirtual.gov.br/catalogo?page=N` até acabar (título, instituição,
     carga horária e link).
   - *Bradesco:* percorre `ev.org.br/cursos?pagina=N` até acabar (título, carga e link).
   - *+IFMG:* três buscas (`a`, `e`, `o`) em `mais.ifmg.edu.br/maisifmg` com `perpage=500`, uma
     união que evita perder curso; carga, "gratuito" e "certificado" em `course/info.php`.
   - *Mundi:* uma página HTML estática (`mundi.ifsul.edu.br/portal/`) com todos os cursos e a duração.
   Das duas últimas só entram título, carga e link; o conteúdo fica na plataforma de origem.
2. **Confere se a coleta é confiável, fonte por fonte.** Se uma fonte falhar, vier vazia, vier
   com mais de 30% a menos que a anterior, ou perder mais de 40% dos cursos que aparecem no
   site, **só ela** é recusada: mantém a versão anterior (no ar e nos arquivos) e as outras
   fontes são atualizadas normalmente. A issue daquela execução avisa qual fonte falhou
   (título "…, mas FALHOU: <fonte>"). Só se **nenhuma** fonte for coletada a execução inteira
   falha: nada é publicado e ela fica vermelha (o GitHub manda e-mail de falha).
3. **Filtra por regra.** O curso é reconhecido pelo **título**, não pelo link
   (`dados/decisoes-catalogos.json`):
   - título que já tem decisão: **herda** a decisão (as que a equipe tomou à mão são `o: "manual"`);
   - título novo: é classificado pelas regras de `scripts/lib/regras.js` e a decisão fica
     registrada (`o: "auto"`);
   - decisão automática vale pela **regra de hoje**: se `regras.js` mudar, os cursos já coletados
     são reavaliados na execução seguinte e a issue lista o que mudou. As manuais não mudam.
4. **Confere links** dos cursos visíveis da EVG e do Bradesco (quebrado = 404/410, erro, ou
   redirecionamento para a lista). No Aprenda Mais os links vêm da listagem pública da
   turma vigente, então estão no ar por construção. Link quebrado só é **reportado**.
5. **Grava** `dados/cursos-*.js`, `dados/filtro-publico.js` e `dados/decisoes-catalogos.json`
   (só se algo mudou) e faz commit na `main`.
6. **Abre uma issue** com o resumo, **só quando houve mudança ou falha** (semana sem
   novidade não gera issue): o que entrou (e o que apareceu no site), o que saiu, links
   quebrados, repetidos descartados e o motivo de cada decisão automática.

Dentro de cada catálogo vale **um curso por título** (o primeiro coletado): o site
reconhece o curso pelo título, e dois cursos com o mesmo nome apareceriam repetidos.

## Critérios das regras (curso novo)

Os mesmos do filtro de público, nesta ordem:

1. cópia "(extra …)" → oculta;
2. idiomas: níveis 1 a 4 ficam, do 5 em diante não;
3. **oculta** se for: servidor / gestão pública / contexto institucional, professor / escola /
   EaD, matéria de ensino médio ou acadêmica, TI técnica, laboratório, profissional já formado,
   gestão ou jurídico especializados, nível avançado;
4. **mantém** se for tema útil para renda ou vida cotidiana: cuidado e saúde básica, segurança
   do trabalho básica, renda e negócio próprio, dinheiro do dia a dia, trabalho e carreira,
   comunicação e português, inclusão, informática do dia a dia, construção e reparos,
   alimentação, produção rural familiar, hotelaria;
5. se repete um curso já visível em outro catálogo → oculta;
6. **sem regra que case → oculta** (na dúvida, não aparece).

**Perfil declarado pelo curso (só Aprenda Mais).** O resumo de cada curso (`course/info.php`) traz
Público-alvo e Requisitos. Para decisões **automáticas** (cursos novos), o curso é ocultado se
declarar: (a) público só de profissionais, professores ou servidores, ou exigir ser/atuar na área;
(b) exigência de escolaridade (ensino médio, superior, graduação, técnico); (c) exigência de
conhecimento prévio (informática, HTML, ter feito outro curso, noções de...). Sinais fracos
("estudantes do ensino médio/superior") e público de uma área (alimentos, construção civil) **não**
ocultam. Decisão **manual** nunca é sobreposta; a issue lista os cursos visíveis por decisão
manual que o perfil apontaria para ocultar.

A **carga mínima de 15h** não entra nas regras: é aplicada à parte, no site
(`js/config.js`). Um curso de 15 a 19h aparece com a etiqueta "(15–19h)". No Aprenda Mais a carga
real de cada curso vem de `course/info.php` (uma requisição por curso; a maioria tem 20h ou 30h,
só uma parte tem 40h). Se não for possível ler a carga de mais de 10% dos cursos, a fonte é
tratada como falha e mantém a versão anterior.

`node scripts/validar-regras.js` mostra o quanto as regras concordam com as decisões já
tomadas à mão. Atenção: as regras foram ajustadas em cima dessas mesmas decisões, então o
número é otimista para cursos realmente novos. A issue de cada execução é o teste de verdade.

## Como discordar de uma decisão

Edite `dados/decisoes-catalogos.json`: troque `d` para `manter` ou `ocultar` e ponha
`"o": "manual"`. A próxima execução respeita (decisão existente nunca é refeita).
Para melhorar uma regra, edite `scripts/lib/regras.js` e rode `node scripts/validar-regras.js`.

## Rodar na sua máquina

```bash
node scripts/atualizar-catalogos.js --simular      # faz tudo, não grava; só escreve relatorio-atualizacao.md
node scripts/atualizar-catalogos.js                # grava os arquivos de dados
node scripts/atualizar-catalogos.js --sem-links    # pula a conferência de links (mais rápido)
node scripts/atualizar-catalogos.js --ignorar evg  # só teste local: não coleta a EVG e mantém os dados dela
```

Precisa de Node 18 ou mais novo. Demora cerca de 2 a 3 minutos (a EVG tem ~77 páginas).
`relatorio-atualizacao.md` não vai para o repositório (está no `.gitignore`).

## Se algo der errado

- **Desligar o filtro no site:** `FILTRAR_PUBLICO_FAMILIAS = false` em `js/config.js`.
- **Parar as atualizações:** desative o workflow em *Actions → Atualizar catálogos → Disable*.
- **Desfazer uma atualização:** `git revert <commit "Atualização automática…">` e push.
- **Curso errado apareceu:** corrija a decisão (acima); a próxima execução (ou *Run workflow*)
  já o esconde.

## Limites conhecidos

- O site de origem pode mudar o HTML; nesse caso a coleta vem vazia, nada é publicado e a
  issue avisa.
- A classificação automática é por título. Curso com título enganoso pode passar; por isso
  cada issue lista o que entrou no site.
- **Uma fonte fora do ar não bloqueia as outras**: ela mantém a versão anterior e a issue
  avisa. Aconteceu de verdade: o site da EVG ficou "Em manutenção" e as demais foram
  atualizadas. A próxima execução semanal tenta a EVG de novo.
- **Termos de uso e robots.txt (conferidos em 2026-10-21):** +IFMG e Mundi não têm robots.txt
  nem termos públicos que tratem de coleta. O portal só lê título, carga e link da listagem
  pública e aponta para o curso (não copia conteúdo).
- Pelo GitHub, agendamentos de repositórios sem atividade por 60 dias são pausados; as
  próprias atualizações automáticas contam como atividade quando há mudança.

---

## Mapa: camadas (cursos presenciais e computador/internet)

O mapa de cada município tem três camadas que a pessoa liga e desliga (por padrão vêm todas ligadas). Os pontos antigos de **cursos** e **empregadores** deixaram de aparecer no mapa, mas continuam em `dados/mapa-pontos.js`.

0. **Serviços (CRAS, PAT, Sebrae Aqui):** círculos rosa "S", vindos de `dados/mapa-pontos.js` (grupo `cras`).

1. **Cursos presenciais (escolas):** quadrados laranja com o número de cursos. Ao clicar: endereço, lista de cursos (com link, quando o curso vem da planilha ou do Trampolim).
2. **Computador e internet:** círculos verdes ("Tem computador") e azuis ("Só Wi-Fi"), com os dois selos explicados abaixo do mapa.

### De onde vêm os pontos
| Camada | Fonte | Como atualiza |
|---|---|---|
| Escolas | **Senac-SP**: cadastro manual das 18 unidades (nome e endereço, sem cursos) em `scripts/fontes/unidades-senac-cadastro.json`; a coordenada é calculada pelo endereço. Os cursos do Senac vêm da planilha. | coordenada semanal (workflow **Atualizar mapa**) |
| Escolas | **Senai-SP**: páginas de unidade (endereço; coordenadas calculadas) | semanal |
| Escolas | **Trampolim**: cursos presenciais trazem endereço e coordenada; viram "locais de curso" | ao vivo, ao escolher a cidade |
| Escolas | **Planilha, aba cursos**: cursos presenciais do Senai/Senac entram na lista da unidade | ao vivo |
| Computador | **Bibliotecas** que declaram computador para o público ou Wi-Fi (cadastro estadual SisEB) | levantamento anual à mão + geocodificação semanal |
| Computador | **Aba pontos_digitais** da planilha (telecentros, lan houses, Acessa SP, outros) | ao vivo |

**Planilha → unidade (sem chute).** O curso da planilha entra na unidade só quando a instituição é Senai ou Senac e há **uma única** unidade dessa instituição na cidade, ou quando o texto desempata ("SENAC - Faccini"). Com mais de uma unidade e nada que desempate, o curso **não vai para o mapa** (continua na lista normal). Para desempatar, a equipe cria na aba **cursos** uma coluna nova chamada exatamente **unidade**, depois da última coluna (hoje a coluna M, à direita de "origem"), e escreve nela o trecho que distingue a unidade (ex.: "Dutra", "Cyber e IA", "Faccini"). A coluna é opcional e só é lida para esse desempate; o resto do portal ignora. O relatório semanal lista os casos que ainda faltam.

**Coordenadas.** Quando só há endereço, o script semanal calcula a coordenada com o Nominatim (OpenStreetMap): rua + número, 1 consulta por segundo, resultado guardado em `dados/geocache.json` (cada endereço é consultado uma vez). Rodovias e resultados a mais de 12 km do município são recusados. O erro típico é de uns 350 m. O navegador nunca chama o Nominatim. A atribuição "© OpenStreetMap contributors" já aparece no mapa.

### Serviços (CRAS, CREAS, PAT, Sebrae Aqui): três fontes, sem repetir o mesmo lugar
A camada **Serviços** junta, nesta ordem de prioridade (quem vem primeiro vence e é completado pelos seguintes):
1. **Aba `servicos` da planilha** (cadastro da equipe) — **desligada** até `PLANILHA_SERVICOS_CSV_URL` (js/config.js) receber o link CSV da aba.
2. **Mapa de campo** (`dados/mapa-pontos.js`, grupo `cras`) — continua aparecendo; o tipo é deduzido do nome.
3. **CRAS e CREAS oficiais** (`dados/servicos-oficiais.js`), dos microdados abertos do **Censo SUAS** (MDS).

Mesmo lugar = mesmo município e mesmo tipo e (mesmo endereço, ou mesmo nome sem o tipo e a cidade, ou menos de 300 m de distância). Pontos de tipos diferentes nunca se fundem.

**Aba `servicos`.** Colunas na primeira linha, em minúsculas: `municipio | tipo | nome | endereco | bairro | horario | telefone | status | lat | lon`. `tipo`: CRAS, CREAS, PAT, Sebrae Aqui ou outro. `status`: Ativo, ou Fechado/Encerrado para esconder. `lat`/`lon` opcionais: sem elas o script semanal calcula pelo endereço (mesmo cache das outras abas). Depois de criar e publicar a aba na web, cole o link CSV em `PLANILHA_SERVICOS_CSV_URL`.

**Censo SUAS (CRAS/CREAS).** Gerado à mão uma vez por ano (o censo sai em ~agosto) com `node scripts/gerar-servicos-oficiais.js [ANO]`; **não** roda no workflow semanal. Ele baixa dois zips públicos de `aplicacoes.mds.gov.br/snas/defeso/censosuas/ANO/`, lê só o arquivo de dados gerais e não guarda e-mails nem dados de pessoal. Limitações: (a) o censo **não traz o nome da unidade**, então o rótulo é o endereço; (b) latitude/longitude vêm corrompidas e são reconstruídas, e coordenada a mais de 20 km do município é descartada (a unidade fica fora do mapa e o script lista); (c) é levantamento autodeclarado anual, não o CadSUAS em tempo real. **Termos:** dado aberto do MDS (Decreto 8.777/2016), sem restrição declarada a download automatizado e sem bloqueio do servidor; o site do MDS é CC BY-ND (atribuição, sem obras derivadas): citamos a fonte no pop-up ("Censo SUAS 2025 (MDS)") e usamos só dados do serviço. Os Leia-me do censo não foram lidos.

**PAT e Sebrae Aqui: sem fonte automática.** O site do Governo de SP (Incapsula/Imperva) e o do Sebrae-SP (HTTP 429) bloqueiam acesso automatizado, e não foi possível ler os termos deles. Não contornamos. PAT e Sebrae Aqui devem entrar pela aba `servicos` (digitados a partir dos sites oficiais) ou por arquivo aberto/autorização, se obtidos.

### Senac: coleta automática DESLIGADA
Os termos de uso do site do Senac-SP proíbem robôs e acesso automatizado e a cópia dos dados do portal sem consentimento. Por isso o script **não acessa mais o site do Senac** e nenhum curso coletado de lá fica no repositório. O código da coleta continua em `scripts/lib/coletores-mapa.js` e só roda se a chave `COLETAR_SENAC=1` (ou `--coletar-senac`) for ligada em `scripts/atualizar-mapa.js`: **só faça isso com autorização por escrito do Senac**. Para incluir ou corrigir uma unidade do Senac, edite o JSON de cadastro manual.

### Aba nova da planilha: `pontos_digitais`
Criar uma aba chamada exatamente **pontos_digitais**, com estas colunas na primeira linha (nesta ordem, em minúsculas):

| Coluna | O que escrever |
|---|---|
| municipio | um dos 47 municípios, escrito como no portal |
| tipo | telecentro, biblioteca, acessa_sp, lan_house ou outro |
| nome | nome do lugar |
| endereco | rua e número (ex.: "Rua das Flores, 123") |
| bairro | bairro |
| recursos | computador, wifi ou "computador e wifi" (vazio = computador) |
| horario | ex.: "seg a sex, 9h às 17h" |
| gratuito | sim, não ou "pago por hora" |
| telefone | telefone **do local** |
| observacao | qualquer informação útil |
| status | Ativo, ou Fechado/Encerrado para esconder |
| verificado_em | data da última conferência (DD/MM/AAAA) |
| lat | latitude (opcional), ex.: -23,5432 |
| lon | longitude (opcional), ex.: -46,7654 |

- Com **lat e lon** preenchidas, o ponto aparece **na hora**. Para pegar a coordenada: no Google Maps, clique com o botão direito no local e clique nos números que aparecem.
- Sem lat/lon, o script semanal calcula pelo endereço (aparece em até uma semana).
- Não coloque dados de pessoas (nome de quem cadastrou, e-mail).
- Depois de criar a aba: **Arquivo > Compartilhar > Publicar na web**, publique também essa aba, copie o link CSV dela e coloque em `PLANILHA_PONTOS_CSV_URL` (js/config.js). Enquanto estiver vazio, a camada mostra só as bibliotecas.

### Bibliotecas: como atualizar
O arquivo `scripts/fontes/bibliotecas-siseb.json` é um levantamento do cadastro estadual (respostas de 2019 a 2025). Computador e Wi-Fi saíram do texto dos PDFs dos questionários, por extração automática **sem conferência manual**: confirme por telefone antes de divulgar como certo. O levantamento **não é automático**; vale refazê-lo uma vez por ano. Os dados pessoais (telefones, e-mails) foram removidos de propósito.

### Se algo der errado
- Cada fonte é isolada: se uma falhar, mantém a versão anterior só dela e a issue ("Mapa AAAA-MM-DD: … FALHOU: <fonte>") avisa.
- (Só se a coleta do Senac for religada com autorização) O Senac já bloqueou um IP por excesso de consultas: o script faz 1 por segundo e para no primeiro erro 403, mantendo a versão anterior.
- Para desligar uma camada para todos: apague os pontos de `dados/unidades.js` ou de `dados/pontos-computador.js` (deixe a lista vazia).
