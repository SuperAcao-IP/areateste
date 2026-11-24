# Filtro do robô de vagas (ordem)
Fonte da verdade: `config.toml` e `robo/filtro.py`. Este texto só explica a ordem. O primeiro corte vale.

1. `excluir_sempre`: empresa, título, descrição ou link com o termo → "excluída".
2. `sinais_de_golpe` no título ou na descrição → "sinal de golpe".
3. Cidade fora dos municípios do programa e das vizinhas → "fora da região". A cidade aceita "Campinas - SP", "Campinas/SP", "Campinas (SP)".
4. Trabalho remoto, híbrido e home office **não cortam**: a vaga entra marcada ("Remoto"/"Híbrido") e o portal mostra o aviso "pode exigir computador e internet próprios".
5. Título com termo de `titulo_acima_da_entrada` (salvo `titulo_acima_excecoes`) → "título acima da entrada".
6. Título sem termo de `titulo_entrada` → "cargo fora das funções de entrada".
7. Contrato: estágio, trainee, PJ, autônomo, freelancer, banco de talentos → "contrato". Gupy: `vacancy_type_effective` = CLT, `_apprentice` = Jovem Aprendiz, `_temporary` = Temporário.
8. Ensino superior completo exigido → "exige ensino superior". "2 anos de experiência" ou mais → "exige anos de experiência".
9. Prazo de inscrição já passou → "inscrições encerradas".
10. Nota (base 5, entre 0 e 10): +2 sem experiência; +2 ensino fundamental (ou +1 ensino médio); +1 jovem aprendiz; +1 município do programa (não vizinho); +1 benefícios/treinamento (`palavras_boas`); −2 pede experiência (6 meses, 1 ano, "na função", "comprovada"). Entra com nota ≥ `nota_minima` (5).

Os itens 3 a 6 não dependem da descrição: nos portais (Catho, InfoJobs, vagas.com), a página da vaga só é aberta se a vaga passar neles (`filtro.precorte`), para gastar menos acessos.

A vaga aprovada ganha `municipio` (onde aparece no portal), `tipo` (CLT, Jovem Aprendiz, Temporário), `experiencia` ("Sem experiência") e `escolaridade` ("Ensino fundamental"/"Ensino médio"). O portal usa os dois últimos nos filtros "Sem experiência" e "Até fundamental completo".
