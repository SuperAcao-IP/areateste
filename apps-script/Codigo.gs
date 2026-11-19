/**
 * ============================================================================
 *  SUPERAÇÃO SP · Backend Google Apps Script
 * ============================================================================
 *  Recebe POST do portal para adicionar/excluir cursos e vagas na planilha,
 *  registra os logins e entrega ao painel de acompanhamento a lista de acessos
 *  (só para quem informar a chave do painel).
 *
 *  DEPLOY:
 *  1. Abra a planilha do Google Sheets
 *  2. Menu Extensões → Apps Script
 *  3. Cole este código inteiro (apague o que estiver lá)
 *  4. Engrenagem "Configurações do projeto" → "Propriedades do script" →
 *     adicione PAINEL_CHAVE com a MESMA chave que se digita no painel
 *  5. Clique em "Implantar" → "Gerenciar implantações"
 *  6. Edite a implantação existente e escolha "Nova versão"
 *  7. Clique em "Implantar" (a URL continua a mesma)
 *
 *  IMPORTANTE — como as colunas são gravadas:
 *  Este script grava PELO NOME da coluna, lendo a primeira linha de cada
 *  aba na hora de salvar. Isso significa que você pode inserir, remover ou
 *  reordenar colunas na planilha sem precisar mexer no código de novo.
 *  A única regra: o nome do cabeçalho tem que bater com o nome do campo
 *  enviado pelo portal (municipio, curso, instituicao, modalidade, carga,
 *  link, area, inscricoes_de, inscricoes_ate, status, agente).
 *  Colunas que o portal não conhece são deixadas em branco, e campos que
 *  o portal manda mas não têm coluna são simplesmente ignorados.
 * ============================================================================
 */

const VERSAO = "v8 - painel de acessos (com chave) e registro de cada login";

const ABA_CURSOS = "cursos";
const ABA_VAGAS  = "vagas";
const ABA_EMAILS = "emails";
const ABA_LOG    = "acessos_log";   // uma linha por login (e-mail, data e hora): base dos gráficos por semana do painel

/**
 * Trata requisições POST do portal
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const acao = body.acao;      // "adicionar", "excluir", "registrar_email" ou "painel_acessos"
    const tipo = body.tipo;      // "cursos" ou "vagas"
    const dados = body.dados;    // objeto com os campos

    // registro de e-mail de login: nao depende de aba de cursos/vagas
    if (acao === "registrar_email") {
      const email = body.email || (body.dados && body.dados.email);
      return registrarEmail(SpreadsheetApp.getActiveSpreadsheet(), email);
    }

    // painel de acompanhamento: lista de acessos, so com a chave do painel
    if (acao === "painel_acessos") {
      return painelAcessos(SpreadsheetApp.getActiveSpreadsheet(), body.chave);
    }

    if (!acao || !tipo) {
      return resposta(400, "Campos 'acao' e 'tipo' são obrigatórios.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const aba = ss.getSheetByName(tipo === "vagas" ? ABA_VAGAS : ABA_CURSOS);
    if (!aba) return resposta(404, "Aba '" + tipo + "' não encontrada na planilha.");

    if (acao === "adicionar") {
      return adicionarLinha(aba, tipo, dados);
    } else if (acao === "excluir") {
      return excluirLinha(aba, tipo, body.linha_id);
    } else {
      return resposta(400, "Ação desconhecida: " + acao);
    }
  } catch (err) {
    return resposta(500, "Erro interno: " + err.message);
  }
}

/**
 * Le o cabecalho da aba e devolve os nomes normalizados
 * (sem acento, minusculo, espacos viram underline)
 */
function lerCabecalho(aba) {
  const ultima = aba.getLastColumn();
  if (ultima < 1) return [];
  return aba.getRange(1, 1, 1, ultima).getValues()[0].map(function (h) {
    return h.toString().trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
  });
}

/**
 * Adiciona uma nova linha, encaixando cada campo na coluna certa pelo nome
 */
function adicionarLinha(aba, tipo, dados) {
  if (!dados) return resposta(400, "Campo 'dados' é obrigatório para adicionar.");

  // o que vem do painel do site entra na coluna "agente" como "admin".
  // linhas digitadas direto na planilha recebem, a mao, o nome de quem
  // da equipe cadastrou -- e isso nunca aparece no site publico.
  if (!dados.agente) dados.agente = "admin";
  // a coluna "origem" marca que a linha saiu do painel do site.
  // e o que separa um cadastro do painel de um digitado a mao com
  // "admin" selecionado no menu da coluna agente.
  dados.origem = dados.origem || "painel";

  const cabecalho = lerCabecalho(aba);
  if (!cabecalho.length) {
    return resposta(500, "A aba '" + aba.getName() + "' está sem cabeçalho na primeira linha.");
  }

  const linha = cabecalho.map(function (col) {
    if (!col) return "";                       // coluna sem titulo fica vazia
    const v = dados[col];
    return (v === undefined || v === null) ? "" : v;
  });

  aba.appendRow(linha);
  aplicarFormulaStatus(aba, tipo, cabecalho, aba.getLastRow(), dados.status);

  // avisa se algum campo enviado nao tem coluna correspondente
  const ignorados = Object.keys(dados).filter(function (k) {
    return k !== "origem" && cabecalho.indexOf(k) === -1 && dados[k] !== "";
  });

  return resposta(200, "Adicionado com sucesso.", {
    linha: aba.getLastRow(),
    campos_sem_coluna: ignorados
  });
}

/**
 * Registra o e-mail de quem entrou na plataforma, na aba "emails".
 * Um e-mail = uma linha. Se ja existir, so atualiza a data do ultimo
 * acesso e soma 1 no contador, em vez de criar linha repetida.
 * A aba e criada sozinha na primeira vez que alguem faz login.
 * Cada login tambem vira uma linha na aba "acessos_log" (e-mail e data),
 * para o painel contar quantas pessoas entraram em cada semana.
 * As colunas da aba "emails" sao achadas PELO NOME (email, ultimo_acesso,
 * acessos): colunas acrescentadas a mao, como "municipio", nao atrapalham.
 */
function registrarEmail(ss, email) {
  email = (email || "").toString().trim().toLowerCase();
  if (!email || email.indexOf("@") < 1) return resposta(400, "E-mail inválido.");

  // trava para dois logins simultaneos nao gravarem em cima um do outro
  const trava = LockService.getScriptLock();
  try { trava.waitLock(15000); } catch (e) { return resposta(503, "Planilha ocupada, tente de novo."); }

  try {
    let aba = ss.getSheetByName(ABA_EMAILS);
    if (!aba) aba = ss.insertSheet(ABA_EMAILS);
    if (aba.getLastRow() < 1) {
      aba.appendRow(["email", "primeiro_acesso", "ultimo_acesso", "acessos"]);
      aba.setFrozenRows(1);
    }

    const agora = new Date();
    registrarLog(ss, email, agora);

    const cab = lerCabecalho(aba);
    const cEmail = Math.max(0, cab.indexOf("email"));
    const cUltimo = cab.indexOf("ultimo_acesso");
    const cAcessos = cab.indexOf("acessos");
    const ultima = aba.getLastRow();

    if (ultima >= 2) {
      const existentes = aba.getRange(2, cEmail + 1, ultima - 1, 1).getValues();
      for (let i = 0; i < existentes.length; i++) {
        if ((existentes[i][0] || "").toString().trim().toLowerCase() === email) {
          const linha = i + 2;
          const n = cAcessos >= 0 ? (Number(aba.getRange(linha, cAcessos + 1).getValue()) || 0) : 0;
          if (cUltimo >= 0) aba.getRange(linha, cUltimo + 1).setValue(agora);
          if (cAcessos >= 0) aba.getRange(linha, cAcessos + 1).setValue(n + 1);
          return resposta(200, "Acesso registrado.", { email: email, novo: false, acessos: n + 1 });
        }
      }
    }

    // linha nova, montada pelo nome das colunas (as que o script nao conhece ficam vazias)
    const valores = { email: email, primeiro_acesso: agora, ultimo_acesso: agora, acessos: 1 };
    aba.appendRow(cab.map(function (c) { return valores[c] !== undefined ? valores[c] : ""; }));
    return resposta(200, "Acesso registrado.", { email: email, novo: true, acessos: 1 });
  } finally {
    trava.releaseLock();
  }
}

/**
 * Uma linha por login na aba "acessos_log" (criada sozinha).
 */
function registrarLog(ss, email, quando) {
  let log = ss.getSheetByName(ABA_LOG);
  if (!log) {
    log = ss.insertSheet(ABA_LOG);
    log.appendRow(["email", "data_hora"]);
    log.setFrozenRows(1);
  }
  log.appendRow([email, quando]);
}

/**
 * Painel de acompanhamento: devolve a aba "emails" (todas as colunas, pelo
 * nome do cabecalho) e os logins da aba "acessos_log".
 * So responde se a chave bater com a propriedade PAINEL_CHAVE do script
 * (Configuracoes do projeto → Propriedades do script). Sem a propriedade,
 * nao entrega nada.
 */
function painelAcessos(ss, chave) {
  const esperada = PropertiesService.getScriptProperties().getProperty("PAINEL_CHAVE");
  if (!esperada) return resposta(503, "A propriedade PAINEL_CHAVE não foi configurada no Apps Script.");
  if (!chave || String(chave) !== String(esperada)) return resposta(401, "Chave do painel não confere.");

  const iso = function (v) { return (v instanceof Date) ? v.toISOString() : v; };
  const lerAba = function (nome) {
    const aba = ss.getSheetByName(nome);
    if (!aba || aba.getLastRow() < 2) return [];
    const cab = lerCabecalho(aba);
    return aba.getRange(2, 1, aba.getLastRow() - 1, cab.length).getValues().map(function (linha) {
      const o = {};
      cab.forEach(function (c, i) { if (c) o[c] = iso(linha[i]); });
      return o;
    });
  };
  return resposta(200, "ok", { pessoas: lerAba(ABA_EMAILS), logins: lerAba(ABA_LOG), versao: VERSAO });
}

/**
 * Converte um indice de coluna (0 = A) na letra usada em formula
 */
function letraColuna(indice0) {
  var n = indice0 + 1, s = "";
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Escreve a formula de status na linha recem-criada, para que a coluna
 * se atualize sozinha com o passar dos dias, igual as linhas antigas:
 *   - inscricoes_de ainda no futuro  -> "Aguardando abertura"
 *   - inscricoes_ate ja passou       -> "Fechado"
 *   - resto                          -> "Aberto"
 * Se a pessoa marcou "Encerrado" na mao, respeita a escolha e nao mexe.
 */
function aplicarFormulaStatus(aba, tipo, cabecalho, linha, statusEscolhido) {
  if ((statusEscolhido || "").toString().toLowerCase() === "encerrado") return;

  var iSt = cabecalho.indexOf("status");
  if (iSt < 0) return;

  var iDe, iAte;
  if (tipo === "vagas") {
    iDe  = cabecalho.indexOf("data");        // data de publicacao
    iAte = cabecalho.indexOf("validade");    // validade informada (opcional)
    if (iDe < 0 && iAte < 0) return;
  } else {
    iDe  = cabecalho.indexOf("inscricoes_de");
    iAte = cabecalho.indexOf("inscricoes_ate");
    if (iAte < 0) return;
  }

  var cAte = iAte >= 0 ? letraColuna(iAte) + linha : null;
  var cDe  = iDe  >= 0 ? letraColuna(iDe)  + linha : null;
  var celula = aba.getRange(linha, iSt + 1);

  // Planilhas em portugues usam ";" para separar os argumentos da formula,
  // e em ingles usam ",". Tenta com virgula e, se a celula der erro,
  // reescreve com ponto e virgula.
  var separadores = [",", ";"];
  for (var i = 0; i < separadores.length; i++) {
    celula.setFormula(montarFormulaStatus(tipo, cDe, cAte, separadores[i]));
    SpreadsheetApp.flush();
    var mostrado = celula.getDisplayValue().toString();
    if (mostrado.charAt(0) !== "#") return;   // deu certo
  }
  // nenhum dos dois funcionou: deixa um valor simples para nao ficar com erro
  celula.setValue("Aberto");
}

/**
 * Monta a formula de status usando o separador de argumentos indicado
 */
function montarFormulaStatus(tipo, cDe, cAte, sep) {
  if (tipo === "vagas") {
    // cDe = data de publicacao, cAte = validade informada.
    // Sem validade, a vaga vale dois meses depois da data.
    if (!cDe)  return '=IF(' + cAte + '=""' + sep + '"Aberto"' + sep
                    + 'IF(' + cAte + '<TODAY()' + sep + '"Fechado"' + sep + '"Aberto"))';
    if (!cAte) return '=IF(' + cDe + '=""' + sep + '"Aberto"' + sep
                    + 'IF(EDATE(' + cDe + sep + '2)<TODAY()' + sep + '"Fechado"' + sep + '"Aberto"))';
    var vale = 'IF(' + cAte + '<>""' + sep + cAte + sep + 'EDATE(' + cDe + sep + '2))';
    return '=IF(AND(' + cDe + '=""' + sep + cAte + '="")' + sep + '"Aberto"' + sep
         + 'IF(' + vale + '<TODAY()' + sep + '"Fechado"' + sep + '"Aberto"))';
  }
  var base = 'IF(' + cAte + '=""' + sep + '"Aberto"' + sep
           + 'IF(' + cAte + '<TODAY()' + sep + '"Fechado"' + sep + '"Aberto"))';
  if (!cDe) return "=" + base;
  return '=IF(AND(' + cDe + '<>""' + sep + cDe + '>TODAY())' + sep
       + '"Aguardando abertura"' + sep + base + ')';
}

/**
 * Exclui uma linha pela identificação (busca pela combinação de campos-chave)
 */
function excluirLinha(aba, tipo, linhaId) {
  if (!linhaId) return resposta(400, "Campo 'linha_id' é obrigatório para excluir.");

  const campoChave = tipo === "vagas" ? "cargo" : "curso";
  const campoChave2 = "municipio";

  const dados = aba.getDataRange().getValues();
  const header = lerCabecalho(aba);

  const idxChave = header.indexOf(campoChave);
  const idxChave2 = header.indexOf(campoChave2);

  if (idxChave < 0) return resposta(404, "Coluna '" + campoChave + "' não encontrada.");

  // Busca de tras para frente (para nao bagunçar indices ao excluir)
  for (let i = dados.length - 1; i >= 1; i--) {
    const valChave = (dados[i][idxChave] || "").toString().trim();
    const valMun = idxChave2 >= 0 ? (dados[i][idxChave2] || "").toString().trim() : "";

    if (valChave === (linhaId[campoChave] || "").trim() &&
        valMun === (linhaId[campoChave2] || "").trim()) {
      aba.deleteRow(i + 1);
      return resposta(200, "Linha excluída com sucesso.", { linha_removida: i + 1 });
    }
  }

  return resposta(404, "Linha não encontrada na planilha.");
}

/**
 * Resposta padronizada em JSON
 */
function resposta(status, mensagem, extra) {
  const obj = Object.assign({ status: status, mensagem: mensagem }, extra || {});
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Trata requisições GET (para teste — abre no navegador)
 */
function doGet(e) {
  return resposta(200, "Backend SuperAção SP ativo. Versão: " + VERSAO);
}
