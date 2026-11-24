import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn("inp", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn("txa", className)} {...p} />;
});

export { Select, type SelectOption } from "./select";

/** a labelled form row. A <div> (not <label>) so custom controls such as Select are not re-clicked by label activation */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("f-row", className)} role="group" aria-label={label}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="sw" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}
