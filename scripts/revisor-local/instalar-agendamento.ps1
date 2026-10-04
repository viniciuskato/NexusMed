# Cria a tarefa "NexusMed Revisor Local" no Agendador de Tarefas do Windows: uma rodada do revisor a cada
# 15 minutos, com a janela escondida, sem segunda rodada enquanto uma esta em andamento, tambem na bateria.
# Roda como o seu usuario, so com voce logado (e o login do Supabase CLI e o do Claude sao os seus).
# Chame pelo instalar-agendamento.cmd. Para desligar, ligar ou remover, veja o RUNBOOK, secao 3.3.
$ErrorActionPreference = 'Stop'
$nome = 'NexusMed Revisor Local'
$vbs = Join-Path $PSScriptRoot 'rodar-revisor.vbs'
$projeto = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not (Test-Path $vbs)) { throw "Nao achei $vbs" }

$acao = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //Nologo "' + $vbs + '"') -WorkingDirectory $projeto
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 15)
$config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 90)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $config `
  -Description 'NexusMed: revisor de IA dos envios (aconselha; quem publica e o dono). Uma rodada a cada 15 minutos.' -Force | Out-Null
Write-Host "Tarefa '$nome' criada: uma rodada a cada 15 minutos. Registro: $env:LOCALAPPDATA\NexusMedRevisor\revisor.log"
