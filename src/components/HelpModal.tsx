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
  ["SEM", "Error estándar de la media (σ/√N); barras X/Y cuando se promedian bloques."],
  ["RMS", "Root Mean Square o valor eficaz. I RMS₅₀ se calcula sobre las últimas 50 muestras."],
  ["RTT / jitter", "Tiempo de ida y vuelta / variación temporal usados al sincronizar navegador y Flipper."],
  ["CSV", "Archivo tabular exportable; el crudo conserva las muestras y el procesado conserva medias y errores."],
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
          <div className="grid gap-3 md:grid-cols-2">
            <HelpBlock title="Flujo recomendado">
              En Ajustes conecta la montura y ejecuta «Escanear montura». Conecta el Flipper por BLE o USB-COM,
              sincroniza su reloj y abre «Test ejes». Elige CW o CCW. El test mueve primero 2° en el sentido contrario,
              invierte el giro y sólo inicia el ADC cuando <Code>:j</Code> confirma el cruce por 0°, ya con el motor en régimen.
            </HelpBlock>
            <HelpBlock title="Tres velocidades distintas">
              <b className="text-fog">Solicitada</b>: la que escribes. <b className="text-fog">Programada real</b>:
              la posible tras redondear T1 y respetar T1≥6. <b className="text-fog">Medida :j</b>: desplazamiento
              angular dividido por el tiempo entre lecturas reales del controlador; es la referencia experimental.
            </HelpBlock>
            <HelpBlock title="Modo de motor y frenado">
              Jog y Test usan velocidad continua: modo lento a velocidades como 0,199°/s y rápido sólo cuando T1 lento
              ya no alcanza. GOTO se reserva para llegar a una posición concreta; programa destino y frenado <Code>:M</Code>.
              El modo <Code>:G</Code> se selecciona siempre antes de T1 y con el motor completamente parado.
            </HelpBlock>
            <HelpBlock title="Jog, GOTO y 800×">
              <b className="text-fog">Jog</b> mueve mientras mantienes una flecha y se para al soltar. <b className="text-fog">GOTO</b>
              conoce un destino y frena allí. En EQMOD, 800 significa 800 veces la velocidad sideral: unos 3,34°/s en
              la NEQ6; su preset 4 suele ser 800× y la velocidad 9 de SynScan es la máxima.
            </HelpBlock>
            <HelpBlock title="De dónde sale el ángulo">
              Cada punto de posición ancla procede de la respuesta <Code>:j</Code> de la montura, con el offset
              0x800000 retirado y el contador de 24 bits desenvuelto. Como el ADC muestrea mucho más rápido, el
              ángulo de cada muestra se interpola en el tiempo entre dos anclas <Code>:j</Code>. No se integra la
              velocidad solicitada ni se inventa el final. En la NEQ6 paso a paso, <Code>:j</Code> es el contador
              interno de pasos, no un encoder mecánico: no puede detectar una pérdida física de pasos.
            </HelpBlock>
            <HelpBlock title="Muestras por grado">
              Antes del test se muestra la estimación <Code>Hz ADC / °·s⁻¹ programados</Code>. Durante y después se
              calcula el valor medido usando sólo muestras situadas entre anclas de feedback y el recorrido angular
              observado. Una tasa alta o una velocidad baja aportan más muestras por grado.
            </HelpBlock>
            <HelpBlock title="Tasa ADC solicitada y efectiva">
              La tasa solicitada es la orden enviada al Flipper; la efectiva se calcula con sus timestamps. Si difieren,
              revisa OVF y el transporte. El firmware v3.1 elimina una conversión lenta que limitaba 1000 Hz a unos
              320 Hz. BLE puede rendir menos que USB-COM; reduce la tasa si aparecen desbordamientos.
            </HelpBlock>
            <HelpBlock title="Promedio y barras de error">
              ×1 conserva cada muestra. ×N agrupa N muestras consecutivas y representa su media. En cartesiano,
              las barras Y son el SEM de la corriente y las X el SEM del ángulo; el CSV procesado guarda ambos,
              además de N real por grupo. El crudo nunca se modifica.
            </HelpBlock>
            <HelpBlock title="Cómo leer la FFT">
              La frecuencia indica repeticiones por segundo y el periodo su separación temporal. «Cada °» convierte
              ese periodo a recorrido de la montura mediante la velocidad medida por <Code>:j</Code>: por ejemplo,
              2 s a 0,4 °/s equivalen a una repetición cada 0,8°. Sin feedback angular no se muestra esa conversión.
            </HelpBlock>
            <HelpBlock title="Zoom, picos, elipse y exportación">
              Activa Zoom/Pan, usa la rueda y arrastra; Restaurar recupera el encuadre. FFT conserva cinco picos
              automáticos y permite añadir/quitar otros manuales. Pulsa un punto Polar/Cartesiano para reposicionar.
              I RMS₅₀ es el valor eficaz móvil de las últimas 50 muestras. Al terminar, Polar muestra la elipse y sus ejes.
              «Exportar todo» crea un ZIP con PNG, CSV crudo/procesado, espectro FFT, picos y resumen JSON.
            </HelpBlock>
          </div>

          <h3 className="mb-2 mt-5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ember">Siglas y términos</h3>
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
        </div>
      </section>
    </div>
  );
}

function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded border border-line bg-[#0a1424]/70 p-3"><h3 className="mb-1.5 font-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-fog">{title}</h3><p>{children}</p></section>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-[#101f38] px-1 text-ember">{children}</code>;
}
