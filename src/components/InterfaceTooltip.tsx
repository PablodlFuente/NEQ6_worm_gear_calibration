import { useEffect, useRef, useState } from "react";

type TooltipState = { text: string; x: number; y: number; above: boolean } | null;

export default function InterfaceTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setTooltip(null);
    };
    const targetWithHelp = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest<HTMLElement>("[title], [data-tooltip]") : null;
      if (!element) return null;
      const native = element.getAttribute("title");
      if (native) {
        element.dataset.tooltip = native;
        element.removeAttribute("title");
        if (!element.getAttribute("aria-label") && !element.textContent?.trim()) element.setAttribute("aria-label", native);
      }
      return element.dataset.tooltip ? element : null;
    };
    const enter = (event: Event) => {
      const element = targetWithHelp(event.target);
      if (!element) return;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const rect = element.getBoundingClientRect();
        const x = Math.max(150, Math.min(window.innerWidth - 150, rect.left + rect.width / 2));
        const above = rect.top > 100;
        setTooltip({ text: element.dataset.tooltip!, x, y: above ? rect.top - 9 : rect.bottom + 9, above });
      }, 480);
    };
    const leave = (event: Event) => {
      const pointer = event as PointerEvent;
      const from = targetWithHelp(pointer.target);
      const to = targetWithHelp(pointer.relatedTarget);
      if (from && from === to) return;
      cancel();
    };
    document.addEventListener("pointerover", enter, true);
    document.addEventListener("pointerout", leave, true);
    document.addEventListener("focusin", enter, true);
    document.addEventListener("focusout", cancel, true);
    window.addEventListener("scroll", cancel, true);
    return () => {
      cancel();
      document.removeEventListener("pointerover", enter, true);
      document.removeEventListener("pointerout", leave, true);
      document.removeEventListener("focusin", enter, true);
      document.removeEventListener("focusout", cancel, true);
      window.removeEventListener("scroll", cancel, true);
    };
  }, []);

  if (!tooltip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[120] max-w-[330px] rounded border border-ion/45 bg-[#091426]/[0.98] px-2.5 py-2 font-mono text-[9.5px] leading-relaxed text-fog shadow-[0_8px_30px_rgba(0,0,0,0.65),0_0_0_1px_rgba(76,201,240,0.05)]"
      style={{ left: tooltip.x, top: tooltip.y, transform: `translate(-50%, ${tooltip.above ? "-100%" : "0"})` }}
    >
      <span className="mr-1 text-ion">◆</span>{tooltip.text}
    </div>
  );
}
