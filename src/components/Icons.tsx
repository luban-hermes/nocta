import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 18, ...p }: P) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const SearchIcon = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const MoonIcon = (p: P) => (<svg {...base(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>);
export const SunIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const CloseIcon = (p: P) => (<svg {...base({ strokeWidth: 2.2, size: 16, ...p })}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const SparkIcon = (p: P) => (<svg {...base(p)}><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /></svg>);
export const ArrowUpIcon = (p: P) => (<svg {...base({ strokeWidth: 2.2, ...p })}><path d="M12 19V5M5 12l7-7 7 7" /></svg>);
export const SendIcon = (p: P) => (<svg {...base({ strokeWidth: 2.2, ...p })}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const DotsIcon = (p: P) => (<svg {...base({ size: 16, ...p })}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>);
export const PinIcon = (p: P) => (<svg {...base({ size: 11, fill: "currentColor", stroke: "none", ...p })}><path d="M15 3l6 6-3 1-3.5 3.5L14 18l-2 2-4-4-4.5 4.5L3 20l4.5-4.5-4-4 2-2 4.5-.5L13.5 6z" /></svg>);
export const UpIcon = (p: P) => (<svg {...base({ size: 15, ...p })}><path d="m6 15 6-6 6 6" /></svg>);
export const DownIcon = (p: P) => (<svg {...base({ size: 15, ...p })}><path d="m6 9 6 6 6-6" /></svg>);
export const TrashIcon = (p: P) => (<svg {...base({ size: 15, ...p })}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const CopyIcon = (p: P) => (<svg {...base({ size: 15, ...p })}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>);
export const PlayIcon = (p: P) => (<svg {...base({ size: 22, fill: "#fff", stroke: "none", ...p })}><path d="M8 5v14l11-7z" /></svg>);
