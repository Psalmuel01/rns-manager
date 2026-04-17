export function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const candidate = error as {
    shortMessage?: string;
    message?: string;
    details?: string;
    cause?: unknown;
  };

  const message =
    candidate.shortMessage ||
    candidate.details ||
    extractNestedMessage(candidate.cause) ||
    candidate.message;

  if (!message) return fallback;

  if (message.includes("User rejected") || message.includes("rejected the request")) {
    return "Transaction rejected in wallet.";
  }
  if (message.includes("insufficient funds")) {
    return "Insufficient funds for gas or value.";
  }
  if (message.includes("Wrong network")) {
    return "Switch your wallet to Rootstock Testnet.";
  }

  return message;
}

function extractNestedMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const nested = error as { shortMessage?: string; message?: string; cause?: unknown };
  return nested.shortMessage || nested.message || extractNestedMessage(nested.cause);
}
