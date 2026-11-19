"""Filtro do perfil do programa, conferência das vagas e arquivo do portal. Rodar: python -m unittest discover tests"""
import json
import tempfile
import tomllib
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from robo import RAIZ, conferir, filtro, municipios, portal
from robo.fontes import Vaga

CFG = tomllib.load((RAIZ / "config.toml").open("rb"))
HOJE = date(2026, 11, 23)


def v(cargo, desc="", cidade="Campinas", modelo="on-site", tipo="vacancy_type_effective", prazo="", empresa="Mercado X", link="https://x.gupy.io/jobs/1"):
    return Vaga(empresa, cargo, link, "Gupy", cidade, "SP", modelo, tipo, desc, prazo)


class TestMunicipios(unittest.TestCase):
    def test_le_programa_e_vizinhas_do_site(self):
        self.assertIn("Campinas", municipios.programa())
        self.assertGreaterEqual(len(municipios.programa()), 40)
        self.assertIn("Rio Claro", municipios.vizinhas()["Santa Gertrudes"])

    def test_cidade_alvo(self):
        self.assertEqual(municipios.cidade_alvo("campinas - SP"), "Campinas")
        self.assertEqual(municipios.cidade_alvo("Rio Claro/SP"), "Rio Claro")
        self.assertEqual(municipios.cidade_alvo("SANTA BARBARA D'OESTE"), "Santa Bárbara d'Oeste")
        self.assertEqual(municipios.cidade_alvo("São Paulo"), "")
        self.assertEqual(municipios.cidade_alvo("Recife"), "")

    def test_aparece_para(self):
        self.assertIn("Santa Gertrudes", municipios.aparece_para("Rio Claro"))
        self.assertEqual(municipios.aparece_para("Campinas")[0], "Campinas")


class TestFiltro(unittest.TestCase):
    def test_vaga_de_entrada_passa_e_ganha_nota(self):
        x = v("Auxiliar de Limpeza", "Não é necessário experiência. Ensino fundamental completo. Vale transporte.")
        self.assertTrue(filtro.avaliar(x, CFG, HOJE), x.motivos)
        self.assertEqual((x.municipio, x.tipo, x.experiencia, x.escolaridade), ("Campinas", "CLT", "Sem experiência", "Ensino fundamental"))
        self.assertGreaterEqual(x.nota, 9)

    def test_jovem_aprendiz_passa(self):
        x = v("Jovem Aprendiz Administrativo", tipo="vacancy_type_apprentice")
        self.assertTrue(filtro.avaliar(x, CFG, HOJE), x.motivos)
        self.assertEqual(x.tipo, "Jovem Aprendiz")

    def test_cidade_vizinha_passa_e_fica_com_o_nome_dela(self):
        x = v("Repositor", cidade="Rio Claro")
        self.assertTrue(filtro.avaliar(x, CFG, HOJE), x.motivos)
        self.assertEqual(x.municipio, "Rio Claro")

    def test_cortes(self):
        casos = {
            "fora da região": v("Auxiliar de Cozinha", cidade="São Paulo"),
            "trabalho remoto": v("Atendente", modelo="remote"),
            "contrato": v("Auxiliar Administrativo", tipo="vacancy_type_internship"),
            "título acima da entrada": v("Analista de Logística Júnior"),
            "cargo fora das funções de entrada": v("Designer Gráfico"),
            "exige ensino superior": v("Assistente de Vendas", "Requisitos: ensino superior completo em Administração."),
            "exige anos de experiência": v("Operador de Empilhadeira", "Experiência mínima de 3 anos na função."),
            "sinal de golpe": v("Vendedor", "Para começar é preciso adquirir o kit inicial."),
            "inscrições encerradas": v("Atendente", prazo="2026-11-01"),
        }
        for categoria, x in casos.items():
            with self.subTest(categoria=categoria):
                self.assertFalse(filtro.avaliar(x, CFG, HOJE))
                self.assertEqual(filtro.categoria_corte(x.motivos), categoria, x.motivos)

    def test_tecnico_corta_mas_auxiliar_tecnico_passa(self):
        self.assertFalse(filtro.avaliar(v("Técnico de Manutenção"), CFG, HOJE))
        self.assertTrue(filtro.avaliar(v("Auxiliar Técnico de Manutenção"), CFG, HOJE))

    def test_contrato_por_texto(self):
        self.assertEqual(filtro.contrato(v("x", tipo="Efetivo – CLT"))[0], "CLT")
        self.assertEqual(filtro.contrato(v("x", tipo="Temporário"))[0], "Temporário")
        self.assertTrue(filtro.contrato(v("x", tipo="PJ"))[1])
        self.assertEqual(filtro.contrato(v("x", tipo=""))[1], "")      # não informado passa

    def test_precorte_nao_olha_descricao(self):
        self.assertEqual(filtro.precorte(v("Auxiliar de Produção", "ensino superior completo"), CFG), "")
        self.assertTrue(filtro.precorte(v("Gerente de Loja"), CFG))


class TestPortalEConferencia(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        pasta = Path(self.tmp.name)
        self.p1 = mock.patch.object(portal, "ATIVAS", pasta / "ativas.json")
        self.p2 = mock.patch.object(portal, "SAIDA", pasta / "vagas-robo.js")
        self.p1.start(); self.p2.start()

    def tearDown(self):
        self.p1.stop(); self.p2.stop(); self.tmp.cleanup()

    def _aprovada(self, cargo, link, cidade="Campinas"):
        x = v(cargo, cidade=cidade, link=link)
        self.assertTrue(filtro.avaliar(x, CFG, HOJE), x.motivos)
        return x

    def test_acrescenta_sem_repetir_e_exporta(self):
        a = self._aprovada("Auxiliar de Cozinha", "https://x.gupy.io/jobs/1?jobBoardSource=gupy")
        self.assertEqual(portal.acrescentar([a, a], "2026-11-23"), 1)
        self.assertEqual(portal.exportar(hoje="2026-11-23", max_por_municipio=25), 1)
        arq = json.loads(portal.SAIDA.read_text(encoding="utf-8"))
        self.assertEqual((arq["atualizado"], arq["no_robo"]), ("2026-11-23", 1))
        dados = arq["vagas"]
        self.assertEqual((dados[0]["cargo"], dados[0]["municipio"], dados[0]["publicadaEm"], dados[0]["fonte"]),
                         ("Auxiliar de Cozinha", "Campinas", "23/11/2026", "Gupy"))

    def test_limite_por_municipio_fica_com_as_melhores(self):
        ativas = [{"id": str(i), "municipio": "Campinas", "nota": n, "publicada": d} for i, (n, d) in
                  enumerate([(6, "2026-11-20"), (9, "2026-11-01"), (9, "2026-11-10"), (7, "2026-11-22")])]
        ativas.append({"id": "x", "municipio": "Limeira", "nota": 5, "publicada": "2026-11-01"})
        escolhidas = portal.selecionar(ativas, 2)
        self.assertEqual([a["id"] for a in escolhidas], ["2", "1", "x"])

    def test_caixa_alta_vira_titulo(self):
        self.assertEqual(portal.sem_caixa_alta("AUXILIAR DE SERVIÇOS GERAIS - LIMEIRA"), "Auxiliar de Serviços Gerais - Limeira")
        self.assertEqual(portal.sem_caixa_alta("Auxiliar de TI"), "Auxiliar de TI")

    def test_conferencia_tira_fechadas_e_mantem_incertas(self):
        links = {
            "https://a.gupy.io/jobs/1": (200, "https://a.gupy.io/jobs/1", "<h1>Auxiliar</h1><p>Candidate-se</p>"),
            "https://a.gupy.io/jobs/2": (404, "https://a.gupy.io/jobs/2", "não encontrada"),
            "https://a.gupy.io/jobs/3": (200, "https://a.gupy.io/", "<h1>Vagas abertas</h1>"),
            "https://www.catho.com.br/vagas/x/4": (200, "https://www.catho.com.br/vagas/x/4", "<p>Esta vaga foi encerrada.</p>"),
            "https://www.infojobs.com.br/vaga-5": (200, "https://www.infojobs.com.br/vaga-5", "<title>Just a moment</title> captcha"),
        }
        portal.acrescentar([self._aprovada(f"Auxiliar {i}", l) for i, l in enumerate(links)], "2026-11-20")
        fechadas, incertas, abertas = conferir.conferir(CFG, HOJE, abrir=lambda url: links[url], pausa=0, log=lambda m: None)
        self.assertEqual(len(abertas), 1)
        self.assertEqual(sorted(a["link"][-1] for a, _ in fechadas), ["2", "3", "4"])
        self.assertEqual(len(incertas), 1)
        self.assertEqual(len(portal.ler_ativas()), 2)   # aberta + incerta continuam

    def test_gupy_pelo_status_da_pagina(self):
        def pagina(status_vaga):
            dados = {"props": {"pageProps": {"job": {"status": status_vaga, "expiresAt": None}}}}
            # as traduções da página (dentro de <script>) falam em "candidaturas encerradas" mesmo com a vaga aberta
            return ('<script>{"jobclosed":"Candidaturas encerradas"}</script>'
                    f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(dados)}</script><h1>Auxiliar</h1>')
        a = {"link": "https://a.gupy.io/jobs/1", "cargo": "x", "empresa": "x", "entrou_em": "2026-11-20"}
        self.assertEqual(conferir.situacao(a, CFG, HOJE, abrir=lambda u: (200, u, pagina("published"))), ("aberta", ""))
        self.assertEqual(conferir.situacao(a, CFG, HOJE, abrir=lambda u: (200, u, pagina("closed")))[0], "fechada")
        self.assertEqual(conferir.situacao(a, CFG, HOJE, abrir=lambda u: (200, "https://a.gupy.io/candidates/signin", "login"))[0], "fechada")

    def test_login_de_outro_site_fica_incerta(self):
        a = {"link": "https://www.linkedin.com/jobs/view/123", "cargo": "x", "empresa": "x", "entrou_em": "2026-11-20"}
        self.assertEqual(conferir.situacao(a, CFG, HOJE, abrir=lambda u: (200, "https://www.linkedin.com/authwall?x=1", ""))[0], "incerta")

    def test_vaga_velha_sai_sem_abrir_a_pagina(self):
        portal.acrescentar([self._aprovada("Repositor", "https://a.gupy.io/jobs/9")], "2026-08-01")
        def nao_abre(url):
            raise AssertionError("não devia abrir")
        fechadas, _, _ = conferir.conferir(CFG, HOJE, abrir=nao_abre, pausa=0, log=lambda m: None)
        self.assertIn("dias no portal", fechadas[0][1])


if __name__ == "__main__":
    unittest.main()
