# Instala no computador da equipe o que o robô de vagas precisa para a parte do LinkedIn e do Indeed,
# e agenda a Tarefa do Windows (toda segunda às 9h). Pode rodar de novo sem problema: só instala o que falta.
#
# Uso (PowerShell, na pasta do repositório):
#   powershell -ExecutionPolicy Bypass -File robo-vagas\instalar.ps1
#   powershell -ExecutionPolicy Bypass -File robo-vagas\instalar.ps1 -Interativo   (a tarefa abre o Claude Code em vez de rodar sem janela)
#   powershell -ExecutionPolicy Bypass -File robo-vagas\instalar.ps1 -SemTarefa    (só confere e instala, sem agendar)
param([switch]$Interativo, [switch]$SemTarefa)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$NomeTarefa = "SuperAcao - Robo de vagas (LinkedIn e Indeed)"

function Test-Comando([string]$nome) { return [bool](Get-Command $nome -ErrorAction SilentlyContinue) }

function Install-SeFaltar([string]$comando, [string]$idWinget, [string]$rotulo) {
    if (Test-Comando $comando) { Write-Host "OK  $rotulo"; return }
    Write-Host "... instalando $rotulo ($idWinget)"
    winget install --id $idWinget --exact --silent --accept-package-agreements --accept-source-agreements
    # o PATH novo só vale numa janela nova: recarrega aqui
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Test-Comando $comando)) { throw "$rotulo foi instalado, mas o comando '$comando' ainda não aparece. Feche e abra o PowerShell e rode de novo." }
}

if (-not (Test-Comando "winget")) { throw "Falta o winget (Instalador de Aplicativos da Microsoft Store). Instale-o e rode de novo." }

Install-SeFaltar "git"    "Git.Git"                 "Git"
Install-SeFaltar "gh"     "GitHub.cli"              "GitHub CLI"
Install-SeFaltar "python" "Python.Python.3.12"      "Python 3.12"
Install-SeFaltar "node"   "OpenJS.NodeJS.LTS"       "Node.js"
if (-not (Test-Comando "claude")) {
    Write-Host "... instalando o Claude Code"
    npm install -g @anthropic-ai/claude-code
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
Write-Host "OK  Claude Code"

# Python 3.12 ou mais novo (o robô usa tomllib)
$versao = (python -c "import sys; print('%d.%d' % sys.version_info[:2])").Trim()
if ([version]$versao -lt [version]"3.11") { throw "O Python encontrado é $versao; o robô precisa do 3.11 ou mais novo." }

# GitHub: a tarefa faz push das vagas novas
gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Falta entrar no GitHub. Rode 'gh auth login' (escolha GitHub.com, HTTPS e login pelo navegador) e depois rode este script de novo."
    exit 1
}
gh auth setup-git
if (-not (git -C $Repo config user.name)) {
    $login = (gh api user --jq .login).Trim()
    git -C $Repo config user.name $login
    git -C $Repo config user.email "$login@users.noreply.github.com"
}

# Testes do robô
Push-Location (Join-Path $Repo "robo-vagas")
try {
    python -m unittest discover tests
    if ($LASTEXITCODE -ne 0) { throw "Os testes do robô falharam (veja acima)." }
} finally { Pop-Location }
Write-Host "OK  testes do robô"

if ($SemTarefa) { Write-Host "Pronto (sem tarefa agendada)."; exit 0 }

# Tarefa do Windows: segunda às 9h; se o computador estava desligado, roda assim que ligar.
$script = Join-Path $PSScriptRoot "rodar-linkedin.ps1"
$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" + $(if ($Interativo) { " -Interativo" } else { "" })
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argumentos -WorkingDirectory $Repo
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho -Settings $config -Description "Robô de vagas do SuperAção SP: LinkedIn e Indeed pelo Claude Code; publica dados/vagas-robo.json" -Force | Out-Null
Write-Host "OK  Tarefa '$NomeTarefa' agendada: toda segunda às 9h$(if ($Interativo) { ' (abre o Claude Code)' } else { ' (sem janela)' })."
Write-Host ""
Write-Host "Falta só: entrar no LinkedIn no Chrome com o e-mail do robô e conferir a extensão Claude in Chrome (veja robo-vagas/INSTALAR.md)."
