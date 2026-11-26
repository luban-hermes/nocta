"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** centered dialog with a scrim; animates transform/opacity only */
export function Modal({ open, onClose, children, label, className }: { open: boolean; onClose: () => void; children: ReactNode; label: string; className?: string }) {
  useEffect(() => {
    if (!open) return;
    // the starfield (and other ambient motion) holds still under the scrim (v0.4.1)
    const b = document.body;
    b.dataset.modals = String(Number(b.dataset.modals || 0) + 1);
    b.classList.add("x-modal-open");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      const n = Math.max(0, Number(b.dataset.modals || 1) - 1);
      b.dataset.modals = String(n);
      if (!n) b.classList.remove("x-modal-open");
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="scrim on" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
          <div className="modal-wrap" key="wrap">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className={cn("modal glass", className)}
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              // a short tween instead of the spring (v0.4.1): the spring's long settling tail kept re-compositing the
              // blurred glass for ~0.5 s, which delayed the first keystrokes typed into the palette
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
