"use client";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ErrIcon, InfoIcon } from "../Icons";
import { onEscapeCapture } from "./floating";
import { ToastProvider } from "./toast";

type ConfirmOpts = { title: string; message?: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean };
type PromptOpts = { title: string; message?: ReactNode; label?: string; defaultValue?: string; placeholder?: string; confirmText?: string; validate?: (v: string) => string | null };
type Req = ({ kind: "confirm" } & ConfirmOpts) | ({ kind: "prompt" } & PromptOpts);
type Api = { confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> };

const Ctx = createContext<Api>({ confirm: async () => false, prompt: async () => null });
/** our replacement for window.confirm / window.prompt — returns promises */
export const useDialog = () => useContext(Ctx);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(Req & { resolve: (v: unknown) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setReq({ kind: "confirm", ...o, resolve: resolve as (v: unknown) => void })), []);
  const prompt = useCallback((o: PromptOpts) => new Promise<string | null>((resolve) => setReq({ kind: "prompt", ...o, resolve: resolve as (v: unknown) => void })), []);
  const done = (v: unknown) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <AnimatePresence>{req && <DialogView key="dlg" req={req} done={done} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

function DialogView({ req, done }: { req: Req; done: (v: unknown) => void }) {
  const cancelV = req.kind === "confirm" ? false : null;
  const [val, setVal] = useState(req.kind === "prompt" ? req.defaultValue ?? "" : "");
  const [err, setErr] = useState("");
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inpRef = useRef<HTMLInputElement>(null);
  const prev = useRef<Element | null>(null);

  useEffect(() => {
    prev.current = document.activeElement;
    const t = setTimeout(() => {
      if (req.kind === "prompt") inpRef.current?.select();
      else if (req.danger) cancelRef.current?.focus(); // destructive: safe default focus
      else okRef.current?.focus();
    }, 30);
    const off = onEscapeCapture(() => done(cancelV));
    return () => {
      clearTimeout(t);
      off();
      (prev.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (req.kind === "confirm") return done(true);
    const e = req.validate?.(val) ?? null;
    if (e) return setErr(e);
    done(val);
  };
  const danger = req.kind === "confirm" && req.danger;
  // keep Tab inside the dialog
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const f = [...e.currentTarget.querySelectorAll<HTMLElement>("button,input")].filter((x) => !x.hasAttribute("disabled"));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) (e.preventDefault(), f[f.length - 1].focus());
    else if (!e.shiftKey && i === f.length - 1) (e.preventDefault(), f[0].focus());
  };

  return (
    <>
      <motion.div className="scrim on dlg-scrim" onClick={() => done(cancelV)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <div className="dlg-wrap">
        <motion.div
          role={danger ? "alertdialog" : "dialog"}
          aria-modal="true"
          aria-labelledby="dlg-t"
          className={cn("dlg glass", danger && "danger")}
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.14 } }}
          transition={{ type: "spring", stiffness: 480, damping: 32 }}
          onKeyDown={trap}
        >
          <div className="dlg-head">
            <span className={cn("dlg-ic", danger && "danger")}>{danger ? <ErrIcon size={18} /> : <InfoIcon size={18} />}</span>
            <h3 id="dlg-t">{req.title}</h3>
          </div>
          {req.message && <div className="dlg-msg">{req.message}</div>}
          {req.kind === "prompt" && (
            <form onSubmit={(e) => (e.preventDefault(), submit())} className="dlg-form">
              {req.label && <label htmlFor="dlg-in">{req.label}</label>}
              <input id="dlg-in" ref={inpRef} className="inp" value={val} placeholder={req.placeholder} onChange={(e) => (setVal(e.target.value), setErr(""))} autoComplete="off" spellCheck={false} />
              <p className="f-err" role="alert">{err}</p>
            </form>
          )}
          <div className="dlg-acts">
            <button ref={cancelRef} type="button" className="btn" onClick={() => done(cancelV)}>
              {(req.kind === "confirm" && req.cancelText) || "取消"}
            </button>
            <button ref={okRef} type="button" className={cn("btn", danger ? "danger-solid" : "pri")} onClick={submit}>
              {req.confirmText || (danger ? "删除" : "确定")}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

/** toasts + dialogs for every page */
export function UIProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DialogProvider>{children}</DialogProvider>
    </ToastProvider>
  );
}
