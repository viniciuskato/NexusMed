' Roda o rodar-revisor.cmd com a janela escondida e espera ele terminar (o Agendador nao abre uma
' segunda rodada enquanto esta nao acabar). Revisor local dos envios (D-12/P7).
Dim sh, pasta, cmd
Set sh = CreateObject("WScript.Shell")
pasta = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
cmd = "cmd.exe /c """ & pasta & "rodar-revisor.cmd"""
WScript.Quit sh.Run(cmd, 0, True)
