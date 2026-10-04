@echo off
rem Instala o agendamento do revisor local (a diretoria roda uma vez; nao precisa de administrador).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-agendamento.ps1"
exit /b %ERRORLEVEL%
