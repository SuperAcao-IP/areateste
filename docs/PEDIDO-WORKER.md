# Pedido de ajuste no Worker de estatísticas

O painel (aba "Uso do portal" e "Visão geral") já está pronto para mostrar **vagas mais procuradas**, **áreas mais clicadas em vagas** e **cliques em vagas por origem**. Falta o servidor de estatísticas (Worker da Cloudflare, `superacao-analytics`) devolver uma lista nova no `/dash`.

## O que o `/dash` devolve hoje
`resumo` (por evento), `cidades`, `lacunas` e `cursos` (`item`, `fonte`, `cliques`, só de `clique_curso`).

## O que falta
Uma lista `vagas`, igual à de `cursos`, mas para o evento `clique_vaga`:

```json
"vagas": [ { "item": "Atendente de Farmácia", "fonte": "robo", "cliques": 8 } ]
```

Em SQL (ajuste os nomes da tabela e das colunas aos do Worker):

```sql
SELECT item, fonte, COUNT(*) AS cliques
FROM eventos            -- nome da tabela do Worker
WHERE ev = 'clique_vaga' AND ts >= :inicio
GROUP BY item, fonte
ORDER BY cliques DESC
LIMIT 30;
```

`fonte` das vagas, enviada pelo `js/analytics.js`: `robo` (Gupy, Catho, InfoJobs, vagas.com), `trampolim`, `spme` (Emprega Brasil) ou `planilha`.

## Eventos novos (já enviados pelo portal)
`clique_pin_vaga`, `clique_pin_escola`, `clique_pin_servico`, `clique_pin_computador`, `cadastro_curso`, `cadastro_vaga`.
Entram sozinhos no `resumo` **se o Worker aceita qualquer nome de evento**. Se ele tiver uma lista de eventos permitidos, inclua estes seis.

## Como conferir
Abra o portal, clique num pin do mapa e, depois, veja a linha correspondente em "O caminho até a oportunidade" (aba Uso do portal).
