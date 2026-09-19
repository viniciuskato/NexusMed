import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Minimize2,
  Maximize2,
  Coffee,
  BrainCircuit,
  Volume2,
  VolumeX,
} from 'lucide-react';

export type PomodoroMode = 'focus' | 'break';

interface ClinicalPomodoroWidgetProps {
  onQuestionOrCardCompleted?: number;
}

export const ClinicalPomodoroWidget: React.FC<ClinicalPomodoroWidgetProps> = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [mode, setMode] = useState<PomodoroMode>('focus');
  const [durationMinutes, setDurationMinutes] = useState<number>(25);
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [completedCycles, setCompletedCycles] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('nexusmed_pomodoro_cycles');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const timerRef = useRef<number | null>(null);

  // useCallback com [soundEnabled] como única dependência real: a função só
  // precisa mudar de identidade quando essa flag muda, e o efeito do timer
  // abaixo pode então listá-la honestamente em vez de suprimir o lint.
  const playChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.75);
    } catch {
      // Navegador sem suporte a Web Audio ou interação bloqueada
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            playChime();
            setIsRunning(false);
            if (mode === 'focus') {
              setCompletedCycles((c) => {
                const next = c + 1;
                try {
                  localStorage.setItem('nexusmed_pomodoro_cycles', next.toString());
                } catch {
                  // ignore
                }
                return next;
              });
              // Alterna para pausa
              setMode('break');
              setTimeLeft(5 * 60);
              setDurationMinutes(5);
            } else {
              // Alterna para foco
              setMode('focus');
              setTimeLeft(25 * 60);
              setDurationMinutes(25);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // playChime agora é estável via useCallback([soundEnabled]) e só muda de
    // identidade quando soundEnabled muda — a mesma condição que antes exigia
    // suprimir o lint. Listá-la é honesto: o efeito reinicia o intervalo
    // exatamente quando isRunning/mode mudam OU quando soundEnabled muda
    // (via nova identidade de playChime), nunca a cada render.
  }, [isRunning, mode, playChime]);

  const switchMode = (newMode: PomodoroMode, mins: number) => {
    setIsRunning(false);
    setMode(newMode);
    setDurationMinutes(mins);
    setTimeLeft(mins * 60);
  };

  const toggleTimer = () => setIsRunning(!isRunning);

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(durationMinutes * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const progressPercent = Math.min(100, Math.max(0, 100 - (timeLeft / (durationMinutes * 60)) * 100));

  // Não aberto de todo: botão gatilho sutil no canto inferior esquerdo
  if (!isOpen) {
    return (
      <aside aria-label="Plantão de Foco" className="fixed bottom-20 sm:bottom-6 left-4 z-40">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border border-teal-500/40 text-slate-800 dark:text-slate-200 elev-md hover:border-teal-500 hover:scale-[1.02] transition-all cursor-pointer shadow-lg"
          title="Abrir Plantão de Foco Clínico (Pomodoro)"
        >
          <div className="relative flex items-center justify-center">
            <Timer className={`w-4 h-4 ${isRunning ? 'text-teal-500 animate-pulse' : 'text-slate-500'}`} />
            {isRunning && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-teal-500 animate-ping" />
            )}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">
              Plantão de Foco
            </span>
            <span className="text-xs font-mono font-black tabular-nums text-teal-700 dark:text-teal-400">
              {isRunning ? formattedTime : 'Iniciar 25m'}
            </span>
          </div>
        </button>
      </aside>
    );
  }

  // Modo Minimized (pill discreto)
  if (isMinimized) {
    return (
      <aside aria-label="Plantão de Foco" className="fixed bottom-20 sm:bottom-6 left-4 z-40">
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border border-teal-500/50 shadow-xl elev-md text-slate-800 dark:text-slate-200">
          <button
            type="button"
            className="flex items-center gap-1.5 cursor-pointer"
            onClick={() => setIsMinimized(false)}
            title="Expandir Plantão de Foco"
          >
            <div className={`w-2 h-2 rounded-full ${mode === 'focus' ? 'bg-teal-500' : 'bg-amber-500'} ${isRunning ? 'animate-ping' : ''}`} />
            <span className="font-mono text-xs font-black tabular-nums text-slate-900 dark:text-white">
              {formattedTime}
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {mode === 'focus' ? 'Foco' : 'Pausa'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleTimer}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-teal-600 dark:text-teal-400 cursor-pointer"
            title={isRunning ? 'Pausar' : 'Iniciar'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
            title="Expandir"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  // Modo Completo (Card Expandido)
  return (
    <aside aria-label="Plantão de Foco" className="fixed bottom-20 sm:bottom-6 left-4 z-40 w-72 sm:w-80 animate-in fade-in slide-in-from-bottom-3">
      <div className="p-5 rounded-3xl bg-white/95 dark:bg-[#0E1726]/95 backdrop-blur-xl border border-teal-500/40 dark:border-teal-500/30 elev-lg shadow-2xl text-slate-800 dark:text-slate-100 space-y-4">
        {/* Header do Widget */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black tracking-tight uppercase text-slate-900 dark:text-white">
                Plantão de Foco Clínico
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {completedCycles} {completedCycles === 1 ? 'bloco concluído' : 'blocos concluídos'} hoje
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title={soundEnabled ? 'Silenciar alarme' : 'Ativar alarme'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Minimizar"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer text-xs font-bold"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Seleção de Modos de Plantão */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => switchMode('focus', 25)}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              mode === 'focus' && durationMinutes === 25
                ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Foco 25m
          </button>
          <button
            type="button"
            onClick={() => switchMode('focus', 50)}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              mode === 'focus' && durationMinutes === 50
                ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Prova 50m
          </button>
          <button
            type="button"
            onClick={() => switchMode('break', 5)}
            className={`py-1.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
              mode === 'break'
                ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Coffee className="w-3 h-3" />
            <span>Pausa 5m</span>
          </button>
        </div>

        {/* Display do Relógio */}
        <div className="py-3 flex flex-col items-center justify-center relative">
          <div className="text-4xl sm:text-5xl font-mono font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
            {formattedTime}
          </div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-1">
            {mode === 'focus' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                Imersão Cognitiva Ativa
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Recuperação Sináptica
              </>
            )}
          </span>

          {/* Barra de Progresso Suave */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                mode === 'focus' ? 'bg-teal-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Controles de Play/Pause/Reset */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTimer}
            className={`flex-1 py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer elev-xs transition-all ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-teal-700 hover:bg-teal-800 text-white'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pausar Plantão</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>{timeLeft < durationMinutes * 60 ? 'Retomar' : 'Iniciar Foco'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetTimer}
            className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors"
            title="Reiniciar Bloco"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
