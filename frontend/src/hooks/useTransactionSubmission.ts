import { useCallback } from "react";
import { PublicClient } from "viem";
import { getErrorMessage } from "../lib/errors";
import { ToastKind } from "./useToasts";

type PushToast = (message: string, kind?: ToastKind) => void;

type SubmitOptions = {
  onSuccess?: () => void | Promise<void>;
  setLoading?: (value: boolean) => void;
};

export function useTransactionSubmission(publicClient: PublicClient | undefined, pushToast: PushToast) {
  return useCallback(
    async (label: string, action: () => Promise<`0x${string}`>, options: SubmitOptions = {}) => {
      const { onSuccess, setLoading } = options;

      if (!publicClient) {
        pushToast("Public client not ready.", "error");
        return false;
      }

      setLoading?.(true);
      pushToast(`Submitting ${label}...`);

      try {
        const hash = await action();
        if (import.meta.env.DEV) {
          console.debug(`[${label}] submitted`, hash);
        }
        pushToast(`${label} submitted: ${hash.slice(0, 10)}...`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (import.meta.env.DEV) {
          console.debug(`[${label}] receipt`, receipt);
        }

        if (receipt.status !== "success") {
          pushToast(`${label} failed.`, "error");
          return false;
        }

        pushToast(`${label} confirmed.`, "success");
        await onSuccess?.();
        return true;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug(`[${label}] error`, error);
        }
        pushToast(getErrorMessage(error, `${label} failed.`), "error");
        return false;
      } finally {
        setLoading?.(false);
      }
    },
    [publicClient, pushToast]
  );
}
