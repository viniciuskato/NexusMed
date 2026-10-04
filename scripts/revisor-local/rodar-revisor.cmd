@echo off
rem Revisor local dos envios (D-12/P7): UMA rodada. O Agendador de Tarefas chama este arquivo (pelo
rem rodar-revisor.vbs, que esconde a janela) a cada 15 minutos. Opcoes: as mesmas de cli.ts, por exemplo --local.
rem O registro fica em %LOCALAPPDATA%\NexusMedRevisor\revisor.log (fora do git).
cd /d "%~dp0..\.."
set "NODE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
"%NODE%" --import tsx scripts\revisor-local\cli.ts %*
exit /b %ERRORLEVEL%
