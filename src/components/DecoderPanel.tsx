import type { Decoded, MountProfile } from "../lib/protocol";
import { IconCpu } from "./icons";

export interface DecodedState {
  cmd: string | null;
  line: string;
  d: Decoded;
}

const fmtInt = (n: number) => n.toLocaleString("es-ES");

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line/60 py-1 first:border-t-0">
      <span className="text-[8.5px] uppercase tracking-[0.14em] text-dim">{k}</span>
      <span className={`truncate text-right font-mono text-[11px] tabular-nums ${tone ?? "text-fog"}`}>{v}</span>
    </div>
  );
}

export default function DecoderPanel({ data, profile }: { data: DecodedState | null; profile: MountProfile }) {
  return (
    <section
      className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={{ animationDelay: "90ms" }}
    >
      <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim">
        <span className="h-[7px] w-[7px] shrink-0 bg-ember/80" />
        <IconCpu className="h-3.5 w-3.5 text-ember/70" />
        Decodificador
      </h2>

      {!data ? (
        <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-dim">
          Cada respuesta «=…» o «!…» de la montura se interpreta aquí: valor little-endian,
          posición lógica, grados y bits de estado.
        </p>
      ) : (
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[12px] text-[#ffc46b]">{data.cmd ?? "?"}</span>
            <span className="font-mono text-[10px] text-dim">→</span>
            <span
              className={`truncate font-mono text-[12px] ${
                data.d.kind === "error" ? "text-alert" : "text-mint"
              }`}
            >
              {data.line}
            </span>
          </div>

          <p
            className={`mt-1 font-mono text-[10.5px] leading-snug ${
              data.d.kind === "error" ? "text-[#ffb3b3]" : "text-[#9fc5e8]"
            }`}
          >
            {data.d.desc}
          </p>

          <div className="mt-2">
            {data.d.value !== undefined && (
              <Row k="valor" v={`${fmtInt(data.d.value)} · 0x${data.d.value.toString(16).toUpperCase()}`} />
            )}
            {data.d.logical !== undefined && (
              <>
                <Row k="posición lógica" v={fmtInt(data.d.logical)} tone="text-ion" />
                {profile.cpr1 !== undefined && (
                  <Row
                    k="grados (AR)"
                    v={`${((data.d.logical * 360) / profile.cpr1).toFixed(3)}°`}
                    tone="text-ion"
                  />
                )}
              </>
            )}
            {data.d.kind === "status" && data.d.bits && (
              <Row k="bits" v={data.d.bits.join(" · ")} tone="text-ember" />
            )}
            <Row k="campo hex" v={data.d.raw || "—"} />
          </div>
        </div>
      )}
    </section>
  );
}
