import { create } from "zustand";
import { useEffect } from "react";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast["kind"], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(kind, message) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4200);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience hook: const toast = useToast(); toast.success("...") */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    success: (m: string) => push("success", m),
    error: (m: string) => push("error", m),
    info: (m: string) => push("info", m),
  };
}

/** Renders itself — mounted once in App. */
export function ToastViewport() {
  const { toasts, dismiss } = useToastStore();
  useEffect(() => {
    // no-op: keeps the component reactive
  }, [toasts]);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`min-w-64 max-w-sm rounded-card px-4 py-3 text-left text-sm shadow-hover border animate-[toast-in_.18s_ease-out] ${
            t.kind === "success"
              ? "bg-surface border-success/40 text-text-primary"
              : t.kind === "error"
                ? "bg-surface border-danger/40 text-text-primary"
                : "bg-surface border-border text-text-primary"
          }`}
        >
          <span
            className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${
              t.kind === "success" ? "bg-success" : t.kind === "error" ? "bg-danger" : "bg-info"
            }`}
          />
          {t.message}
        </button>
      ))}
    </div>
  );
}
