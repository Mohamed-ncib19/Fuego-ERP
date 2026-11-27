import type { ReactNode } from "react";
import { useToast as useAstryxToast, ToastViewport as AstryxToastViewport } from "@astryxdesign/core/Toast";
import { StatusDot } from "@astryxdesign/core/StatusDot";

/**
 * App-wide notifications on Astryx Toast. Pages keep the short API they
 * always had: `const toast = useToast(); toast.success("…")`.
 */
export function useToast() {
  const show = useAstryxToast();
  return {
    success: (m: string) =>
      show({
        body: (
          <span className="inline-flex items-center gap-2">
            <StatusDot variant="success" label="Succès" />
            {m}
          </span>
        ),
        isAutoHide: true,
      }),
    error: (m: string) => show({ body: m, type: "error", isAutoHide: true, autoHideDuration: 7000 }),
    info: (m: string) => show({ body: m, isAutoHide: true }),
  };
}

/** Hosts the toasts; wraps the app once in App.tsx. */
export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <AstryxToastViewport position="bottomEnd" maxVisible={3}>
      {children}
    </AstryxToastViewport>
  );
}
