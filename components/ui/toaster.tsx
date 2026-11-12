"use client";
import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info";
interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: Variant;
}
interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}
let seq = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(title: string, opts: { description?: string; variant?: Variant } = {}) {
  useToasts.getState().push({ title, description: opts.description, variant: opts.variant ?? "info" });
}

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.variant === "success" ? CheckCircle2 : t.variant === "error" ? AlertTriangle : Info;
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "ww-in flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg",
              t.variant === "success" && "border-green-200",
              t.variant === "error" && "border-red-200",
              t.variant === "info" && "border-slate-200"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                t.variant === "success" && "text-green-600",
                t.variant === "error" && "text-red-600",
                t.variant === "info" && "text-teal-600"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs text-slate-600">{t.description}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
