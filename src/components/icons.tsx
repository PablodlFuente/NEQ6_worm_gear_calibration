import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconCrosshair = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 2.5V7M12 17v4.5M2.5 12H7M17 12h4.5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPlug = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6Z" />
    <path d="M12 18v4" />
  </svg>
);

export const IconUnplug = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 2v4M15 2v4" />
    <path d="M6 6h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6Z" />
    <path d="m4 18 4 4M8 18l-4 4M14 19l6-6" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="m19 6-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...base(p)}>
    <path d="M22 2 11 13" />
    <path d="m22 2-7 20-4-9-9-4Z" />
  </svg>
);

export const IconActivity = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12h4l3-8 4 16 3-8h6" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconStop = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

export const IconTerminal = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 17 6-6-6-6" />
    <path d="M12 19h8" />
  </svg>
);

export const IconZap = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6Z" />
  </svg>
);

export const IconScroll = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v14" />
    <path d="m6 11 6 6 6-6" />
    <path d="M5 21h14" />
  </svg>
);

export const IconRadar = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.07 4.93A10 10 0 1 1 9 2.07" />
    <path d="M16.24 7.76A6 6 0 1 1 10.5 4.1" />
    <path d="M12 12 7 7" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCpu = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="1" />
    <rect x="10" y="10" width="4" height="4" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </svg>
);

export const IconBook = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </svg>
);

export const IconBluetooth = (p: P) => (
  <svg {...base(p)}>
    <path d="m7 7 10 10-5 5V2l5 5L7 17" />
  </svg>
);

export const IconTelescope = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 8 11-4 2 5-11 4Z" />
    <path d="m15 4 3-1 2 6-3 1M9 12l3 4M12 16l-4 6M12 16l5 6" />
    <circle cx="11.5" cy="15.5" r="1.5" />
  </svg>
);

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03Z" />
  </svg>
);

export const IconArrowUp = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);

export const IconPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 4 14 8-14 8Z" />
  </svg>
);
