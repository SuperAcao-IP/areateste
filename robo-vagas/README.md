# Robô de vagas do SuperAção SP

Acha vagas de emprego de entrada nos municípios do programa e nas cidades vizinhas, filtra pelo perfil do público e publica no portal (`dados/vagas-robo.json`). Toda semana confere as vagas publicadas e **tira as que fecharam**. **Não se candidata a nada.**

Só usa a biblioteca padrão do Python (3.11 ou mais novo).

## Quando e onde roda
| O quê | Onde | Quando |
|---|---|---|
| Conferência das vagas publicadas (a fechada sai) | GitHub Actions (`.github/workflows/buscar-vagas.yml`) | segunda, 9h |
| Gupy (todos os municípios e vizinhas), Catho, InfoJobs, vagas.com (cidades-polo) | GitHub Actions | segunda, 9h |
| LinkedIn (Chrome) e Indeed (conector) | computador da equipe, Tarefa do Windows → `/buscar-linkedin-indeed` | segunda, 9h |

Toda execução no GitHub abre uma issue com o resumo (rótulo `vagas-automatico`) e fecha a da semana anterior. Com os Secrets do Gmail, manda também por e-mail.
Instalação no computador da equipe: [INSTALAR.md](INSTALAR.md).

## Fontes
| Fonte | Como |
|---|---|
| Gupy | API pública do portal (`portal.gupy.io`), um termo por vez em cada cidade |
| Catho, InfoJobs, vagas.com | páginas públicas de busca, com pausa entre acessos; se o site pedir verificação anti-robô, a fonte para e avisa |
| LinkedIn, Indeed | só pelo Claude, comando `/buscar-linkedin-indeed` (na raiz do repositório) |

As cidades não ficam aqui: o robô lê os municípios de `dados/municipios.js` e as vizinhas de `CIDADES_VIZINHAS` (`js/config.js`), como o portal.

## Rodar no computador
```
cd robo-vagas
python -m unittest discover tests
python -m robo.buscar --sem-email --cidades 2     (teste rápido: 2 cidades)
python -m robo.buscar --sem-email                  (completo: ~40 min)
python -m robo.conferir --simular                  (só mostra quais vagas fecharam)
python -m robo.fila listar
```

## Estrutura
```
config.toml          critérios: termos de busca, cidades-polo, o que corta, sinais de golpe, nota
robo/buscar.py       rotina semanal: confere, busca, filtra, publica, relatório, e-mail
robo/fontes.py       leitura de cada fonte
robo/filtro.py       perfil do programa (ordem em docs/filtro.md)
robo/municipios.py   municípios do programa e vizinhas (lidos do site)
robo/conferir.py     conferência semanal: a vaga fechada sai
robo/portal.py       vagas/ativas.json -> dados/vagas-robo.json
robo/registro.py     vagas/vagas.csv (histórico: nunca avaliar a mesma vaga duas vezes)
robo/fila.py         comandos curtos para o Claude (registrar vaga do LinkedIn/Indeed)
fila.py              atalho para robo/fila.py a partir da raiz do repositório
instalar.ps1         instala e agenda no computador da equipe
rodar-linkedin.ps1   o que a Tarefa do Windows executa
```
