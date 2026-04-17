import { Toast } from "../hooks/useToasts";

type ToastViewportProps = {
  toasts: Toast[];
};

export function ToastViewport({ toasts }: ToastViewportProps) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-2xl border px-4 py-3 text-xs shadow-card backdrop-blur ${
            toast.kind === "success"
              ? "border-mint/40 bg-mint/10 text-mint"
              : toast.kind === "error"
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-white/10 bg-white/10 text-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
