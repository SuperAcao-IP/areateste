# Coleta do Senac no computador da equipe (o GitHub leva 503 do firewall do Senac; aqui, com o IP de casa, funciona).
# A Tarefa do Windows chama este arquivo toda segunda às 9h, depois do robô do mapa do GitHub, que roda no domingo (e mantém o que este publica):
#   1. atualiza o repositório;
#   2. coleta unidades e cursos com bolsa do Senac (1 requisição por segundo; para no primeiro 403);
#   3. publica dados/unidades.js no GitHub.
# Os termos de uso do site do Senac proíbem acesso automatizado; a equipe decidiu coletar em 19/11/2026 (veja scripts/atualizar-mapa.js).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\rodar-senac.ps1
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo
$hoje = Get-Date -Format "yyyy-MM-dd"
$pasta = Join-Path $env:LOCALAPPDATA "SuperAcaoSenac"
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$log = Join-Path $pasta "senac-$hoje.log"
function Write-Log([string]$msg) {
    $linha = "$(Get-Date -Format 'HH:mm:ss') $msg"
    Write-Host $linha
    Add-Content -Path $log -Value $linha -Encoding utf8
}

Write-Log "Atualizando o repositório..."
git pull --rebase origin main 2>&1 | ForEach-Object { Write-Log "$_" }

Write-Log "Coletando o Senac (unidades e cursos com bolsa)..."
$env:COLETAR_SENAC = "1"
$relatorio = Join-Path $pasta "relatorio-senac-$hoje.md"
node scripts/atualizar-mapa.js --ignorar senai,bibliotecas,pontos --relatorio $relatorio 2>&1 | ForEach-Object { Write-Log "$_" }
if ($LASTEXITCODE -ne 0) { Write-Log "A coleta terminou com erro ($LASTEXITCODE). Nada foi publicado."; exit 1 }

git add dados/unidades.js dados/geocache.json dados/pontos-computador.js dados/pontos-geocodificados.js
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Log "Publicando no GitHub..."
    git commit -m "Senac: coleta no computador da equipe ($hoje)" 2>&1 | ForEach-Object { Write-Log "$_" }
    git pull --rebase origin main 2>&1 | ForEach-Object { Write-Log "$_" }
    git push origin HEAD:main 2>&1 | ForEach-Object { Write-Log "$_" }
} else {
    Write-Log "Nada novo para publicar."
}
Write-Log "Fim. Log em $log"
