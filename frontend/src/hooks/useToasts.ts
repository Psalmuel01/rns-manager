import { useCallback, useState } from "react";

export type ToastKind = "info" | "success" | "error";

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

export function useToasts(timeoutMs = 3500) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, kind, message }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, timeoutMs);
  }, [timeoutMs]);

  return { toasts, pushToast };
}
