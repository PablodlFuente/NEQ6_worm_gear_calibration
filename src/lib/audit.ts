type AuditDetail = Record<string, unknown>;

export function audit(event: string, detail: AuditDetail = {}) {
  const payload = {
    clientTimestamp: new Date().toISOString(),
    event,
    page: location.pathname,
    detail,
  };
  void fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* El registro en carpeta sólo está disponible con el servidor local. */
  });
}

function controlLabel(element: HTMLElement): string {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.innerText?.trim().replace(/\s+/g, " ").slice(0, 160) ||
    element.tagName
  );
}

export function installUiAudit(): () => void {
  const onClick = (event: MouseEvent) => {
    const element = (event.target as HTMLElement | null)?.closest<HTMLElement>("button, a, [role='button']");
    if (!element) return;
    audit("ui.click", {
      control: controlLabel(element),
      disabled: element.hasAttribute("disabled"),
    });
  };
  const onChange = (event: Event) => {
    const element = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!element?.matches("input, select, textarea")) return;
    audit("ui.change", {
      control: element.getAttribute("aria-label") || element.name || element.type || element.tagName,
      value: element.type === "checkbox" ? (element as HTMLInputElement).checked : element.value.slice(0, 160),
    });
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
  };
}
