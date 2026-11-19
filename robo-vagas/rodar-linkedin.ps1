# Robô de vagas · LinkedIn e Indeed (roda no computador da equipe; a Tarefa do Windows chama este arquivo toda segunda às 9h).
#   1. atualiza o repositório;
#   2. abre o Claude Code com o comando /buscar-linkedin-indeed (Chrome logado no LinkedIn com o e-mail do robô);
#   3. publica no GitHub as vagas novas (dados/vagas-robo.json) e o histórico.
#
# Uso:  powershell -ExecutionPolicy Bypass -File robo-vagas\rodar-linkedin.ps1               (sozinho, sem janela de conversa)
#       powershell -ExecutionPolicy Bypass -File robo-vagas\rodar-linkedin.ps1 -Interativo   (abre o Claude Code com o comando pronto)
# O modo sozinho depende de o Claude no Chrome funcionar com "claude -p". Se não funcionar, a tarefa usa -Interativo
# (veja robo-vagas/INSTALAR.md).
param([switch]$Interativo)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo
$env:PYTHONIOENCODING = "utf-8"
$hoje = Get-Date -Format "yyyy-MM-dd"
$log = Join-Path $PSScriptRoot "relatorios\$hoje-linkedin.log"

function Write-Log([string]$msg) {
    $linha = "$(Get-Date -Format 'HH:mm:ss') $msg"
    Write-Host $linha
    Add-Content -Path $log -Value $linha -Encoding utf8
}

Write-Log "Atualizando o repositório..."
git pull --rebase origin main 2>&1 | ForEach-Object { Write-Log "$_" }

# Permissões só do que o comando precisa: o atalho do robô, o Chrome e o conector do Indeed.
# (uma por argumento: a primeira tem espaço dentro dos parênteses)
$ferramentas = @("Bash(python robo-vagas/fila.py:*)", "mcp__claude-in-chrome__*", "mcp__claude_ai_Indeed__search_jobs", "mcp__claude_ai_Indeed__get_job_details", "ToolSearch")

if ($Interativo) {
    Write-Log "Abrindo o Claude Code com /buscar-linkedin-indeed (modo interativo)."
    claude --chrome --allowedTools $ferramentas "/buscar-linkedin-indeed"
} else {
    Write-Log "Rodando /buscar-linkedin-indeed sem janela."
    claude -p "/buscar-linkedin-indeed" --chrome --allowedTools $ferramentas 2>&1 | ForEach-Object { Write-Log "$_" }
    if ($LASTEXITCODE -ne 0) { Write-Log "O Claude terminou com erro ($LASTEXITCODE). Veja o log acima." }
}

Write-Log "Publicando as vagas no GitHub..."
python robo-vagas/fila.py exportar 2>&1 | ForEach-Object { Write-Log "$_" }
git add dados/vagas-robo.json robo-vagas/vagas robo-vagas/dados robo-vagas/relatorios
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    git commit -m "Robô de vagas: LinkedIn e Indeed ($hoje)" 2>&1 | ForEach-Object { Write-Log "$_" }
    git pull --rebase origin main 2>&1 | ForEach-Object { Write-Log "$_" }
    git push origin HEAD:main 2>&1 | ForEach-Object { Write-Log "$_" }
} else {
    Write-Log "Nada novo para publicar."
}
Write-Log "Fim."
