# Atualização dos catálogos fixos (automática)

Catálogos: **Aprenda Mais** (MEC), **EVG** (Escola Virtual de Governo) e **Bradesco**
(Escola Virtual da Fundação Bradesco). Arquivos em `dados/`.

Uma GitHub Action roda **toda segunda-feira** (06h em Brasília) e também a qualquer hora
pelo botão *Actions → Atualizar catálogos → Run workflow*. Ninguém precisa aprovar nada:
ela coleta, filtra, confere os links, publica na `main` e abre uma **issue** com o resumo.

## O que acontece em cada execução

1. **Coleta** os três sites (`scripts/lib/coletores.js`), sem login.
   - *Aprenda Mais:* lê as categorias de topo do portal, que guardam a **turma vigente**
     (as antigas ficam em "Turmas anteriores"). A turma é descoberta a cada vez pelo
     "- Turma 2026B" no título; cada turma tem links novos.
   - *EVG:* percorre `escolavirtual.gov.br/catalogo?page=N` até acabar (título, instituição,
     carga horária e link).
   - *Bradesco:* percorre `ev.org.br/cursos?pagina=N` até acabar (título, carga e link).
2. **Confere se a coleta é confiável.** Se qualquer coleta falhar, vier vazia, vier com mais
   de 30% a menos que a anterior, ou se os cursos visíveis no site caírem mais de 40%, **nada
   é gravado nem publicado** e o catálogo anterior continua no ar. A issue avisa e a
   execução fica vermelha (o GitHub manda e-mail de falha).
3. **Filtra por regra.** O curso é reconhecido pelo **título**, não pelo link
   (`dados/decisoes-catalogos.json`):
   - título que já tem decisão: **herda** a decisão (as que a equipe tomou à mão são `o: "manual"`);
   - título novo: é classificado pelas regras de `scripts/lib/regras.js` e a decisão fica
     registrada (`o: "auto"`) para não mudar de uma semana para outra.
4. **Confere links** dos cursos visíveis da EVG e do Bradesco (quebrado = 404/410, erro, ou
   redirecionamento para a lista). No Aprenda Mais os links vêm da listagem pública da
   turma vigente, então estão no ar por construção. Link quebrado só é **reportado**.
5. **Grava** `dados/cursos-*.js`, `dados/filtro-publico.js` e `dados/decisoes-catalogos.json`
   (só se algo mudou) e faz commit na `main`.
6. **Abre uma issue** com o resumo: o que entrou (e o que apareceu no site), o que saiu,
   links quebrados e o motivo de cada decisão automática.

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

A **carga mínima de 15h** não entra nas regras: é aplicada à parte, no site
(`js/config.js`). Um curso de 15 a 19h aparece com a etiqueta "(15–19h)". O Aprenda Mais não
informa a carga publicamente; o site assume 40h.

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
- Pelo GitHub, agendamentos de repositórios sem atividade por 60 dias são pausados; as
  próprias atualizações automáticas contam como atividade quando há mudança.
