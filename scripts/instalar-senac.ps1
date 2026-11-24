# Instala (uma vez) a Tarefa do Windows que coleta o Senac toda segunda às 9h (o computador da equipe fica ligado nesse dia).
# Se o computador estava desligado, a tarefa roda assim que ligar. Uso (PowerShell, na pasta do repositório):
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-senac.ps1            (instala e agenda)
#   powershell -ExecutionPolicy Bypass -File scripts\instalar-senac.ps1 -SemTarefa (só confere os requisitos)
param([switch]$SemTarefa)
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$NomeTarefa = "SuperAcao - coleta do Senac"

# Node 20 ou mais novo
$v = (node --version) 2>$null
if (-not $v) { throw "Falta instalar o Node.js (https://nodejs.org, versão LTS)." }
if ([version]($v.TrimStart("v")) -lt [version]"20.0") { throw "O Node encontrado é $v; precisa do 20 ou mais novo." }
Write-Host "OK  Node $v"

# GitHub: a tarefa faz push de dados/unidades.js. Confere que o git já fala com o GitHub (credencial salva no Windows).
$ErrorActionPreference = "Continue"   # o git escreve avisos normais em stderr; o PowerShell 5 trataria como erro
git -C $Repo ls-remote --exit-code origin main *> $null
$gitOk = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($gitOk -ne 0) { throw "O git não conseguiu falar com o GitHub (credencial). Faça um push manual uma vez e rode este script de novo." }
$ErrorActionPreference = "Continue"
git -C $Repo var GIT_AUTHOR_IDENT *> $null      # o git descobre o autor sozinho (nome do Windows) ou pelo user.name
$autorOk = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($autorOk -ne 0) { throw "O git não sabe quem é o autor. Rode: git config --global user.name 'Seu Nome' e git config --global user.email seu@email" }
Write-Host "OK  GitHub (git)"

if ($SemTarefa) { Write-Host "Pronto (sem tarefa agendada)."; exit 0 }

$script = Join-Path $PSScriptRoot "rodar-senac.ps1"
$acao = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $Repo
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho -Settings $config -Description "Coleta unidades e cursos com bolsa do Senac e publica dados/unidades.js no GitHub" -Force | Out-Null
Write-Host "OK  Tarefa '$NomeTarefa' agendada: toda segunda às 9h."
Write-Host "Para testar agora: powershell -ExecutionPolicy Bypass -File scripts\rodar-senac.ps1"
