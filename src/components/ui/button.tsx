import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "danger" | "ghost";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

/** shadcn-style button using the Nocta `.btn` tokens */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "default", loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(variant === "ghost" ? "icon-btn" : "btn", variant === "primary" && "pri", variant === "danger" && "danger", className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
