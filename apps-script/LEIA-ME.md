# Apps Script da planilha (backend do portal)

`Codigo.gs` é o código que fica **dentro da planilha do Google** (Extensões → Apps Script). Esta cópia no
repositório serve para versionar e revisar; o que vale é o que está colado lá.

O que ele faz:
- grava e exclui cursos e vagas do botão **"Adicionar cursos e vagas aqui"** (`adicionar`, `excluir`);
- registra quem entra no portal (`registrar_email`): aba **emails** (uma linha por pessoa) e aba
  **acessos_log** (uma linha por login, criada sozinha a partir da v8);
- entrega ao **painel** (aba "Acessos") a lista de pessoas e de logins (`painel_acessos`), **só** para quem
  mandar a chave do painel.

## Atualizar para a v8 (uma vez)

1. Abra a planilha → **Extensões → Apps Script**.
2. No arquivo da esquerda (`Código.gs`), selecione tudo (Ctrl+A), apague e cole o conteúdo de `apps-script/Codigo.gs`.
   Salve (Ctrl+S).
3. Clique na **engrenagem** (Configurações do projeto) → role até **Propriedades do script** → **Adicionar
   propriedade do script**:
   - Propriedade: `PAINEL_CHAVE`
   - Valor: a **mesma chave** que se digita na tela de entrada do painel.
   → **Salvar propriedades do script**.
4. **Implantar → Gerenciar implantações** → lápis (editar) na implantação que já existe → Versão: **Nova versão** →
   **Implantar**. A URL continua a mesma (não precisa mexer no portal).
5. Teste: abra a URL do app da web no navegador; deve aparecer "Versão: v8 - painel de acessos...".
   No painel, a aba **Acessos** passa a mostrar a lista.

## Segurança
- Os e-mails **não** vão para o repositório nem para nenhum arquivo público. Só passam pelo navegador de quem
  digitou a chave do painel. A aba "emails" não deve ser publicada na web (Arquivo → Compartilhar → Publicar na
  Web: publique só as abas cursos, vagas, pontos_digitais e serviços).
- Sem a propriedade `PAINEL_CHAVE`, o script **não entrega** a lista a ninguém.
- Se a chave do painel mudar, troque também a propriedade `PAINEL_CHAVE`.

## Colunas da aba "emails"
O script acha as colunas **pelo nome** do cabeçalho: `email`, `primeiro_acesso`, `ultimo_acesso`, `acessos`.
Colunas acrescentadas à mão (por exemplo `municipio`) são respeitadas: o login não mexe nelas e o painel as mostra.
