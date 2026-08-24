import SidePanel, { type AutoState } from "./SidePanel";
import DrivePanel, { type MoveInputs, type MoveState } from "./DrivePanel";
import JogPad from "./JogPad";
import AxisTestPanel, { type AxisTestInputs, type AxisTestState } from "./AxisTestPanel";
import type { MountProfile, QuickCmd } from "../lib/protocol";
import type { SerialSettings, SerialStatus } from "../hooks/useSerial";
import type { FlipperApi } from "../hooks/useFlipper";
import type { DecodedState } from "./DecoderPanel";
import { IconBluetooth, IconCrosshair, IconSettings, IconZap } from "./icons";

export type Tab = "mov" | "montura" | "ajustes" | "test";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  /* conexión / ajustes */
  supported: boolean;
  status: SerialStatus;
  settings: SerialSettings;
  onSettings: (s: SerialSettings) => void;
  portInfo?: SerialPortInfo;
  authorized: SerialPort[];
  onOpenAuthorized: (p: SerialPort) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onQuick: (item: QuickCmd) => void;
  decoded: DecodedState | null;
  profile: MountProfile;
  auto: AutoState;
  onRunDiag: () => void;
  onCancelDiag: () => void;
  /* movimiento */
  inputs: MoveInputs;
  onInputs: (patch: Partial<MoveInputs>) => void;
  move: MoveState;
  onStartMove: () => void;
  onStopMove: (hard: boolean) => void;
  onInitHome: () => void;
  jogAxis: 0 | 1 | 2;
  onStartJog: (axis: 1 | 2, dir: 1 | -1) => void;
  onStopJog: () => void;
  /* flipper */
  flip: FlipperApi;
  axisTestInputs: AxisTestInputs;
  onAxisTestInputs: (patch: Partial<AxisTestInputs>) => void;
  axisTest: AxisTestState;
  onStartAxisTest: () => void;
  onStopAxisTest: () => void;
}

const TABS: { id: Tab; label: string; icon: (p: { className?: string }) => React.ReactNode }[] = [
  { id: "mov", label: "Movimiento", icon: (p) => <IconCrosshair {...p} /> },
  { id: "montura", label: "Montura", icon: (p) => <IconZap {...p} /> },
  { id: "ajustes", label: "Ajustes", icon: (p) => <IconSettings {...p} /> },
  { id: "test", label: "Test ejes", icon: (p) => <IconBluetooth {...p} /> },
];

export default function RightPanel(props: Props) {
  const { tab, onTab } = props;
  const open = props.status === "open";

  return (
    <aside className="flex min-h-0 flex-col lg:overflow-hidden">
      {/* barra de pestañas */}
      <div className="flex shrink-0 gap-1 rounded-t-md border border-b-0 border-line bg-[#0a1424] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded px-1.5 py-2 font-display text-[9.5px] font-bold uppercase tracking-[0.12em] transition-all xl:text-[10px] xl:tracking-[0.16em] ${
              tab === t.id
                ? "bg-ember/12 text-ember shadow-[inset_0_-2px_0_rgba(245,165,36,0.9)]"
                : "text-dim hover:bg-white/[0.03] hover:text-fog"
            }`}
          >
            {t.icon({ className: "h-3.5 w-3.5" })}
            <span className="hidden 2xl:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* contenido */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-b-md border border-line bg-[#081120]/60 p-2">
        {tab === "mov" && (
          <div className="flex flex-col gap-3 pb-2">
            <DrivePanel
              open={open}
              profile={props.profile}
              inputs={props.inputs}
              onInputs={props.onInputs}
              move={props.move}
              onStart={props.onStartMove}
              onStop={props.onStopMove}
              onInitHome={props.onInitHome}
            />
            <JogPad
              disabled={!open || props.move.running}
              activeAxis={props.jogAxis}
              speedLabel={props.inputs.speed || "—"}
              onStart={props.onStartJog}
              onStop={props.onStopJog}
            />
          </div>
        )}

        {tab === "montura" && (
          <SidePanel
            mode="montura"
            flip={props.flip}
            supported={props.supported}
            status={props.status}
            settings={props.settings}
            onSettings={props.onSettings}
            portInfo={props.portInfo}
            authorized={props.authorized}
            onOpenAuthorized={props.onOpenAuthorized}
            onConnect={props.onConnect}
            onDisconnect={props.onDisconnect}
            onQuick={props.onQuick}
            decoded={props.decoded}
            profile={props.profile}
            auto={props.auto}
            onRunDiag={props.onRunDiag}
            onCancelDiag={props.onCancelDiag}
          />
        )}

        {tab === "ajustes" && (
          <SidePanel
            mode="ajustes"
            flip={props.flip}
            supported={props.supported}
            status={props.status}
            settings={props.settings}
            onSettings={props.onSettings}
            portInfo={props.portInfo}
            authorized={props.authorized}
            onOpenAuthorized={props.onOpenAuthorized}
            onConnect={props.onConnect}
            onDisconnect={props.onDisconnect}
            onQuick={props.onQuick}
            decoded={props.decoded}
            profile={props.profile}
            auto={props.auto}
            onRunDiag={props.onRunDiag}
            onCancelDiag={props.onCancelDiag}
          />
        )}

        {tab === "test" && (
          <AxisTestPanel
            inputs={props.axisTestInputs}
            onInputs={props.onAxisTestInputs}
            state={props.axisTest}
            mountOpen={open}
            mountBusy={props.move.running || props.auto.running || props.jogAxis !== 0}
            flip={props.flip}
            movePhase={props.move.phase}
            onStart={props.onStartAxisTest}
            onStop={props.onStopAxisTest}
          />
        )}
      </div>
    </aside>
  );
}
