/* =====================================================================
   INICIALIZACAO  ·  ponto de entrada. Liga os eventos e monta o seletor.
   Precisa ser o ultimo <script> da pagina.
   ===================================================================== */
grade.addEventListener("change",e=>{ if(e.target.value) selecionarCidade(e.target.value); });

montarChips();
