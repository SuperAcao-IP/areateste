"""Testes de leitura das fontes (não dependem dos critérios do config.toml). Rodar: python -m unittest discover tests"""
import unittest

import json
import urllib.parse
from unittest import mock

from robo import fontes
from robo.fontes import Vaga


class TestMesmaVagaEmCidades(unittest.TestCase):
    def test_tira_o_lugar_do_titulo(self):
        from robo import registro
        base = registro.cargo_sem_local("Analista Administrativo")
        for cargo in ["Analista Administrativo - Cotia, São Paulo", "Analista Administrativo - São Paulo", "Analista Administrativo (SP)",
                      "Analista Administrativo - Taboão da Serra, São Paulo"]:
            with self.subTest(cargo=cargo):
                self.assertEqual(registro.cargo_sem_local(cargo), base)

    def test_nao_junta_cargos_diferentes(self):
        from robo import registro
        self.assertNotEqual(registro.cargo_sem_local("Analista Administrativo - Matarazzo"), registro.cargo_sem_local("Analista Administrativo"))
        self.assertNotEqual(registro.cargo_sem_local("Analista de Dados Pleno"), registro.cargo_sem_local("Analista de Dados Júnior"))

    def test_ja_vista_reconhece_outra_cidade_e_outro_link(self):
        from robo import registro
        links, pares = registro.chaves_existentes([{"empresa": "Empresa X", "cargo": "Analista - Cotia, São Paulo", "link": "https://x.gupy.io/jobs/1"}])
        outra = Vaga("Empresa X", "Analista - Caieiras, São Paulo", "https://x.gupy.io/jobs/2", "Gupy")
        self.assertTrue(registro.ja_vista(outra, links, pares))
        self.assertFalse(registro.ja_vista(Vaga("Empresa Y", "Analista - Caieiras", "https://y.gupy.io/jobs/3", "Gupy"), links, pares))


class TestPortais(unittest.TestCase):
    def test_aprendiz_no_vagas_com_vira_jovem_aprendiz(self):
        self.assertEqual(fontes._tipo_pelo_nivel(" Aprendiz "), "Jovem Aprendiz")
        self.assertEqual(fontes._tipo_pelo_nivel("Estágio"), "Estágio")
        self.assertEqual(fontes._tipo_pelo_nivel("Operacional"), "")

    def test_endereco_da_cidade_em_cada_portal(self):
        self.assertEqual(fontes.locais_portais("Santa Bárbara d'Oeste"),
                         {"Catho": "santa-barbara-d-oeste-sp", "InfoJobs": "santa-barbara-d-oeste,-sp", "vagas.com": "santa-barbara-d-oeste"})

    CATHO = '''<li data-offer-item="39057150" data-blind="false" class="mb-5"><article class="offer " data-offer-item-subcontainer>
      <span class="tag pub_ontem mb-2">Publicada em 30/10</span><h2 class="title_offer">
      <a href="/vagas/analista-de-projetos-pleno/39057150" title="Analista de Projetos Pleno" data-navigation-offer>Analista de Projetos Pleno</a></h2>
      <p class="mb-2"><span class="text-12">SBCD SA&#xDA;DE</span></p><p><span class="icon i_job_location"></span><strong>1 vaga</strong> - S&#xE3;o Paulo </p>
      <p><span class="icon i_salary"></span> <strong>A Combinar</strong></p></article></li>'''
    INFOJOBS = '''<div id="vacancy12158378" data-id="12158378" class="js_vacancyLoad" data-href="/vaga-de-analista-projetos-jr-em-sao-paulo__12158378.aspx">
      <a href="/vaga-de-analista-projetos-jr-em-sao-paulo__12158378.aspx"><h2 class="h3 js_vacancyTitle"> Analista&#xA0;De&#xA0;Projetos JR </h2></a>
      <div class="text-medium">27 out</div><div class="text-body"><a href="https://www.infojobs.com.br/x">GTO <span onclick="x" data-bs-title="<div>Este selo</div>" title="selo">RH</span></a></div>
      <div> S&#xE3;o Paulo - SP , 0 Km de voc&#xEA;.</div><div>R$ 6.500,00 a R$ 7.000,00</div><div>H&#xED;brido</div></div>'''
    DETALHE = '''<script type="application/ld+json">{"@type": "JobPosting", "description": "Projetos sociais<br>e indicadores", "validThrough": "2026-12-01T00:00:00"}</script>
      <div>Tipo de contrato e Jornada: Efetivo – CLT - Período Integral</div>'''

    def test_cartao_catho(self):
        from robo import fontes
        x = fontes.ler_cartoes_catho(self.CATHO)[0]
        self.assertEqual((x.empresa, x.cargo, x.cidade, x.salario, x.plataforma), ("SBCD SAÚDE", "Analista de Projetos Pleno", "São Paulo", "", "Catho"))
        self.assertEqual(x.link, "https://www.catho.com.br/vagas/analista-de-projetos-pleno/39057150")

    VAGAS_COM = '''<ul><li class="vaga odd ">
  <header><div class="informacoes-header"><h2 class="cargo">
    <a class="link-detalhes-vaga" data-id-vaga="1" title="Analista de Projetos Pleno" id="v1" href="/vagas/v1/analista-de-projetos-pleno">
      Analista de <mark>Projetos</mark> Pleno
</a></h2><span class="emprVaga">  Associação Pinacoteca </span>
    <div class="nivelQtdVagas"><span class="nivelVaga"> Júnior/Trainee </span></div></div></header>
  <div class="detalhes"><p>Sobre a vaga: apoiar <mark>projetos</mark> culturais.</p></div>
  <footer><div class="vaga-local"><i class="bx bx-map"></i>
      <mark>São Paulo</mark> / SP
      <div class="tooltip-place"><div>A empresa aceita apenas candidaturas de São Paulo</div></div></div></footer>
</li>
<li class="vaga even ">
  <header><div class="informacoes-header"><h2 class="cargo">
    <a class="link-detalhes-vaga" data-id-vaga="2" title="Estágio em Projetos" id="v2" href="/vagas/v2/estagio-em-projetos">Estágio em Projetos</a></h2>
    <span class="emprVaga">Confidencial</span><div class="nivelQtdVagas"><span class="nivelVaga">Estágio</span></div></div></header>
  <div class="detalhes"><p>Apoio.</p></div>
  <footer><div class="vaga-local"><i class="bx bx-map"></i> Recife / PE</div></footer>
</li></ul>'''
    DETALHE_VAGAS_COM = '''<script type="application/ld+json">{"@type": "JobPosting", "description": "Projetos culturais<br>e indicadores", "validThrough": "2026-11-13"}</script>
      <div>A empresa aceita apenas candidaturas de São Paulo Regime CLT Benefícios Descrição</div>'''

    def test_cartao_vagas_com(self):
        from robo import fontes
        a, b = fontes.ler_cartoes_vagas_com(self.VAGAS_COM)
        self.assertEqual((a.empresa, a.cargo, a.cidade, a.estado, a.plataforma, a.tipo), ("Associação Pinacoteca", "Analista de Projetos Pleno", "São Paulo", "SP", "vagas.com", ""))
        self.assertEqual(a.link, "https://www.vagas.com.br/vagas/v1/analista-de-projetos-pleno")
        self.assertIn("projetos culturais", a.descricao)
        self.assertEqual((b.empresa, b.tipo, b.cidade), ("Empresa confidencial", "Estágio", "Recife"))

    def test_detalhe_vagas_com_le_regime_e_prazo(self):
        from robo import fontes
        descricao, prazo, modelo, tipo = fontes.ler_detalhe_vagas_com(self.DETALHE_VAGAS_COM)
        self.assertEqual((prazo, tipo), ("2026-11-13", "CLT"))
        self.assertIn("indicadores", descricao)

    def test_url_vagas_com_e_busca_por_instituicao(self):
        from unittest import mock
        from robo import fontes
        self.assertEqual(fontes._url_vagas_com("memorial da resistência"), "https://www.vagas.com.br/vagas-de-memorial-da-resistencia-em-sao-paulo")
        self.assertTrue(fontes._url_vagas_com("pmo", "recife").endswith("/vagas-de-pmo-em-recife"))
        with mock.patch.object(fontes, "_pagina_portal", side_effect=lambda url: self.VAGAS_COM if "sao-paulo" in url else self.DETALHE_VAGAS_COM):
            vagas = fontes.buscar_vagas_com(["pinacoteca"], lambda v: True, log=lambda m: None, pausa=0)
        self.assertEqual((len(vagas), vagas[0].tipo, vagas[0].prazo), (2, "CLT", "2026-11-13"))

    def test_cartao_infojobs(self):
        from robo import fontes
        x = fontes.ler_cartoes_infojobs(self.INFOJOBS)[0]
        self.assertEqual((x.empresa, x.cargo, x.cidade, x.modelo, x.plataforma), ("GTO RH", "Analista De Projetos JR", "São Paulo", "hybrid", "InfoJobs"))
        self.assertEqual(x.salario, "R$ 6.500,00 a R$ 7.000,00")

    def test_catho_com_nome_escondido_vira_confidencial(self):
        from robo import fontes
        x = fontes.ler_cartoes_catho(self.CATHO.replace("SBCD SA&#xDA;DE", "********"))[0]
        self.assertEqual(x.empresa, "Empresa confidencial")

    def test_detalhe(self):
        from robo import fontes
        desc, prazo, modelo, tipo = fontes.ler_detalhe_vaga(self.DETALHE)
        self.assertEqual((desc, prazo, modelo), ("Projetos sociais e indicadores", "2026-12-01", ""))
        self.assertIn("CLT", tipo)

    def test_abre_a_vaga_so_quando_vale_e_para_no_bloqueio(self):
        from unittest import mock
        from robo import fontes
        abertas = []

        def pagina(url):
            abertas.append(url)
            return self.CATHO if "sao-paulo-sp" in url else self.DETALHE
        with mock.patch.object(fontes, "_pagina_portal", side_effect=pagina):
            vagas = fontes.buscar_catho(["analista de projetos"], lambda v: False, log=lambda m: None, pausa=0)
            self.assertEqual((len(vagas), len(abertas)), (1, 1))
        with mock.patch.object(fontes, "_get", return_value=b"<html>Just a moment... captcha</html>"):
            with self.assertRaises(fontes.PortalBloqueado):
                fontes.buscar_infojobs(["x"], log=lambda m: None, pausa=0)

def job_gupy(i):
    return {
        "id": i, "name": "Analista  de Projetos", "careerPageName": "Fundação X ",
        "city": "São Paulo", "state": "São Paulo", "workplaceType": "hybrid", "type": "vacancy_type_effective",
        "description": "<p>políticas&nbsp;públicas</p>", "applicationDeadline": "2026-11-15T00:00:00.000Z",
        "publishedDate": "2026-11-01T10:00:00.000Z",
        "jobUrl": f"https://fx.gupy.io/job/abc{i}=?jobBoardSource=gupy_portal",
    }


class TestGupy(unittest.TestCase):
    def test_campos(self):
        x = fontes._vaga_gupy(job_gupy(12))
        self.assertEqual(x.link, "https://fx.gupy.io/jobs/12")
        self.assertEqual((x.empresa, x.cargo), ("Fundação X", "Analista de Projetos"))
        self.assertEqual((x.cidade, x.estado, x.modelo), ("São Paulo", "São Paulo", "hybrid"))
        self.assertEqual(x.tipo, "vacancy_type_effective")
        self.assertEqual(x.descricao, "políticas públicas")
        self.assertEqual(x.prazo, "2026-11-15")

    def test_pagina_e_filtra_por_cidade(self):
        urls = []

        def falso_get(url):
            urls.append(url)
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            offset = int(q["offset"][0])
            ids = range(offset, offset + (2 if offset == 0 else 1))
            return json.dumps({"data": [job_gupy(i) for i in ids]}).encode()

        with mock.patch.object(fontes, "_get", falso_get), mock.patch.object(fontes.time, "sleep"):
            vagas = fontes.buscar_gupy(["ação"], cidade="São Paulo", estado="São Paulo",
                                       limite_por_pagina=2, log=lambda *_: None)
        self.assertEqual(len(urls), 2)   # a 2ª página veio incompleta: para aí
        self.assertEqual(len(vagas), 3)
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(urls[0]).query)
        self.assertEqual((q["jobName"][0], q["city"][0], q["state"][0]), ("ação", "São Paulo", "São Paulo"))



if __name__ == "__main__":
    unittest.main()
