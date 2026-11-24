"use client";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ErrIcon, InfoIcon, OkIcon } from "../Icons";

export type ToastType = "ok" | "error" | "info";
type T = { id: number; text: string; type: ToastType };
type Push = (text: string, type?: ToastType) => void;
const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

const ICON = { ok: OkIcon, error: ErrIcon, info: InfoIcon };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const push = useCallback<Push>((text, type = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, text, type }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), type === "error" ? 5000 : 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        <AnimatePresence>
          {list.map((t) => {
            const I = ICON[t.type];
            return (
              <motion.div
                key={t.id}
                layout="position"
                className={cn("toast", t.type)}
                style={{ animation: "none" }}
                initial={{ opacity: 0, y: 20, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
                onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}
              >
                <span className="ti"><I size={15} /></span>
                {t.text}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
