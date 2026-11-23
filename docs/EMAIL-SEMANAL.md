# E-mail semanal do portal (enviado pela conta coordcampo)

Todo domingo, depois que os robôs terminam (~10h30), o GitHub publica o **resumo da semana**:
- página: <https://superacao-ip.github.io/areateste/dados/resumo-semanal.html>
- feed RSS: <https://superacao-ip.github.io/areateste/dados/resumo-semanal.xml>

O e-mail sai da conta **coordcampo.superacao@fgv.br** por um fluxo do **Power Automate** (vem com o Microsoft 365).
O fluxo fica nessa conta, então nenhuma senha fica guardada no GitHub nem em lugar nenhum. O resumo só tem números
agregados (uso, cursos, vagas, municípios sem curso presencial), sem e-mails nem dados pessoais.

## Criar o fluxo (uma vez, uns 5 minutos)

1. Entre em <https://make.powerautomate.com> **com a conta coordcampo.superacao@fgv.br**.
2. **+ Criar** → **Fluxo da nuvem automatizado**.
   - Nome: `Resumo semanal SuperAção`
   - Gatilho: procure **RSS** e escolha **"Quando um item do feed é publicado"** → **Criar**.
3. No gatilho:
   - **URL do feed RSS**: `https://superacao-ip.github.io/areateste/dados/resumo-semanal.xml`
   - (em "Mostrar opções avançadas", se aparecer **Propriedade de data do gatilho**, deixe `PublishDate`)
4. **+ Nova etapa** → procure **Office 365 Outlook** → **"Enviar um email (V2)"**.
   - **Para**: os e-mails de quem recebe, separados por ponto e vírgula (pode mudar quando quiser).
   - **Assunto**: clique em "Conteúdo dinâmico" e escolha **Título do feed** (`Feed title`).
   - **Corpo**: clique no ícone **</>** (modo código) e escolha em "Conteúdo dinâmico" **Resumo do feed**
     (`Feed summary`). O resumo já vem formatado (títulos, tabelas e o botão para o painel).
   - Em "Mostrar opções avançadas": **Importância** = Normal.
5. **Salvar**. Pronto: o e-mail sai todo domingo, uma vez, quando o resumo novo é publicado.

## Testar agora
No fluxo, clique em **Testar** → **Manualmente**. Depois, no GitHub, rode o workflow
**Actions → Resumo semanal (e-mail) → Run workflow**. Em alguns minutos o Power Automate percebe o item novo e manda o
e-mail (o gatilho de RSS confere o feed de tempos em tempos, então pode levar até uns 30 minutos).
Se rodar duas vezes no mesmo dia, o item do dia é substituído, não duplicado.

## Se não funcionar
- **"RSS" ou "Office 365 Outlook" não aparecem / pedem licença**: a TI da FGV pode ter bloqueado o Power Automate para
  essa conta. Peça a liberação dos conectores **RSS** e **Office 365 Outlook** (são conectores padrão, sem custo extra).
- **O e-mail chega sem formatação**: confira se o corpo está em modo código (</>) com o **Resumo do feed**.
- **Os números de uso não aparecem**: falta o Secret `PAINEL_CHAVE` no GitHub (veja o README).
