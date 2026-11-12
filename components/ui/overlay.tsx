"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Backdrop({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-50 bg-slate-900/40 ww-in" onClick={onClose} />;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
        <div className="ww-in w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-slate-100 p-4">{footer}</div>}
        </div>
      </div>
    </>
  );
}

/** Bottom sheet on mobile, right drawer on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <Backdrop onClose={onClose} />
      <div
        className={cn(
          "fixed z-50 bg-white shadow-xl ww-in",
          "inset-x-0 bottom-0 rounded-t-2xl",
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:rounded-none sm:rounded-l-2xl"
        )}
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 sm:max-h-[calc(100vh-140px)]">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 p-4">{footer}</div>}
      </div>
    </>
  );
}
