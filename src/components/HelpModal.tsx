import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TERMS = [
  ["AR / RA", "Ascensión recta (Right Ascension), eje 1."],
  ["DEC", "Declinación, eje 2."],
  ["ADC", "Conversor analógico-digital; aquí mide la caída de tensión del shunt en PA7."],
  ["BLE", "Bluetooth Low Energy, enlace inalámbrico con el Flipper Zero."],
  ["USB-COM / CDC", "Puerto serie virtual por USB; alternativa y respaldo de BLE."],
  ["CPR", "Counts Per Revolution: cuentas/pasos del controlador por vuelta completa."],
  ["T1", "Periodo entero del temporizador del motor. Menor T1 significa mayor velocidad; el mínimo usado es 6 ticks."],
  ["GOTO", "Movimiento del controlador hacia una posición objetivo."],
  ["FFT", "Transformada rápida de Fourier: separa las repeticiones periódicas de la corriente."],
  ["Hz", "Ciclos por segundo. En la FFT, 1 Hz significa una repetición cada segundo."],
  ["SEM", "Incertidumbre de la media. En media móvil se corrige con la autocorrelación a un retardo para no tratar muestras vecinas como independientes."],
  ["RMS", "Root Mean Square o valor eficaz. I RMS usa una ventana temporal móvil de medio segundo."],
  ["σ", "Desviación típica: dispersión de las medidas respecto a su media."],
  ["R̄ circular", "Concentración de la carga en una dirección entre 0 y 1; se calcula ponderando cada ángulo por la corriente."],
  ["OOR / OVF", "Muestras fuera de rango / desbordamientos del búfer del firmware."],
  ["RTT / jitter", "Tiempo de ida y vuelta / variación temporal usados al sincronizar navegador y Flipper."],
  ["CSV", "Archivo tabular exportable; medidas.csv conserva cada conversión ADC con tiempo, corriente, ángulo y revolución."],
  ["IDLE / REC", "Adquisición parada / adquisición activa."],
  ["PA7 / A7", "Entrada analógica del Flipper conectada al shunt."],
  ["Shunt", "Resistencia conocida (0,323 Ω) cuya caída de tensión permite calcular la corriente."],
];

export default function HelpModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ayuda del proyecto"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020711]/85 p-3 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-ember/40 bg-[#081120] shadow-[0_20px_80px_rgba(0,0,0,0.75)]">
        <header className="flex items-center border-b border-line bg-[#0a1424] px-4 py-3">
          <div>
            <h2 className="font-display text-[13px] font-bold tracking-[0.2em] text-fog">AYUDA · NEQ6 WORM-GEAR</h2>
            <p className="mt-1 font-mono text-[9.5px] text-dim">Control de montura y perfil de corriente angular</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded border border-line px-3 py-1.5 font-display text-[10px] text-fog hover:border-ember/50 hover:text-ember">CERRAR · ESC</button>
        </header>

        <div className="overflow-y-auto p-4 font-mono text-[10.5px] leading-relaxed text-dim">
          <a href="https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/wiki" target="_blank" rel="noreferrer" className="mb-4 flex items-center justify-center rounded border border-ion/50 bg-ion/10 px-3 py-2 font-display text-[10px] font-bold tracking-[0.16em] text-ion hover:bg-ion/20">ABRIR WIKI DEL PROYECTO ↗</a>
          <h3 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ember">Siglas y términos</h3>
          <dl className="grid overflow-hidden rounded border border-line md:grid-cols-[150px_1fr]">
            {TERMS.map(([term, meaning]) => (
              <div key={term} className="contents">
                <dt className="border-b border-line/70 bg-[#0c1930] px-3 py-2 font-bold text-ion md:border-r">{term}</dt>
                <dd className="border-b border-line/70 px-3 py-2 text-fog/80">{meaning}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 rounded border border-alert/35 bg-alert/5 p-3 text-[#ffb3b3]">
            Seguridad: deja libre el recorrido, usa STOP ante cualquier riesgo y no cambies comandos de la «zona roja».
            Verifica masa común y que la tensión en PA7 permanezca dentro del rango admisible del Flipper.
          </p>
          <p className="mt-2 rounded border border-line p-3 text-dim">
            Software sin garantía: el usuario asume los riesgos eléctricos, mecánicos y operativos. La programación y
            documentación han sido asistidas por OpenAI Codex. Consulta licencia y disclaimer en la documentación técnica.
          </p>
        </div>
      </section>
    </div>
  );
}
