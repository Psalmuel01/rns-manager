import { Address } from "viem";
import { rootstockTestnet } from "../lib/chain";

type WalletSectionProps = {
  address?: Address;
  approved: boolean;
  bulkAddress: string;
  bulkAddressLocked: boolean;
  bulkManagerAddress?: Address;
  isApproving: boolean;
  isConnected: boolean;
  rifBalanceLabel: string;
  supportsRegistryApproval: boolean;
  walletClientReady: boolean;
  walletChainId?: number;
  onApprove: () => void;
  onBulkAddressChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  shorten: (value?: string) => string;
};

export function WalletSection({
  address,
  approved,
  bulkAddress,
  bulkAddressLocked,
  bulkManagerAddress,
  isApproving,
  isConnected,
  rifBalanceLabel,
  supportsRegistryApproval,
  walletClientReady,
  walletChainId,
  onApprove,
  onBulkAddressChange,
  onConnect,
  onDisconnect,
  shorten
}: WalletSectionProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-white">Wallet</h2>
          <p className="text-sm text-steel">Connect to Rootstock Testnet to manage your domains.</p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <span className="rounded-full border border-white/20 px-4 py-2 text-sm text-white">
                {shorten(address)}
              </span>
              <button
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:border-sun hover:text-sun"
                onClick={onDisconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="rounded-full bg-sun px-6 py-2 text-sm font-semibold text-ink shadow-glow"
              onClick={onConnect}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <label className="text-xs uppercase tracking-wider text-steel">Bulk Manager Address</label>
          <input
            value={bulkAddress}
            onChange={(event) => onBulkAddressChange(event.target.value)}
            placeholder="0x..."
            className="mt-2 w-full rounded-2xl border border-white/10 bg-ink/60 px-4 py-3 text-sm text-white"
            disabled={bulkAddressLocked}
          />
        </div>
        {supportsRegistryApproval ? (
          <button
            className="h-[52px] self-end rounded-2xl border border-white/20 px-5 text-sm text-white hover:border-sun hover:text-sun"
            onClick={onApprove}
            disabled={
              !isConnected ||
              !bulkManagerAddress ||
              !walletClientReady ||
              isApproving ||
              (walletChainId !== undefined && walletChainId !== rootstockTestnet.id)
            }
          >
            {isApproving ? "Approving..." : approved ? "Bulk Manager Approved" : "Approve Bulk Manager"}
          </button>
        ) : (
          <div className="self-end text-xs text-steel">
            Registry approvals not supported on this network.
          </div>
        )}
      </div>

      {!isConnected && (
        <p className="mt-2 text-xs text-steel">Connect your wallet to approve the bulk manager.</p>
      )}
      {isConnected && !bulkManagerAddress && (
        <p className="mt-2 text-xs text-steel">Enter a valid bulk manager address.</p>
      )}
      {isConnected && bulkManagerAddress && walletChainId !== undefined && walletChainId !== rootstockTestnet.id && (
        <p className="mt-2 text-xs text-steel">Switch to Rootstock Testnet (chain 31).</p>
      )}
      {isConnected && bulkManagerAddress && !walletClientReady && (
        <p className="mt-2 text-xs text-steel">Wallet client not ready. Try reconnecting.</p>
      )}
      {!supportsRegistryApproval && (
        <p className="mt-2 text-xs text-steel">
          This registry does not support operator approvals. Set Address uses your wallet directly.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink/60 px-4 py-3 text-xs text-steel">
        <span>Bulk Manager RIF balance</span>
        <span className="text-white">{rifBalanceLabel}</span>
      </div>
    </section>
  );
}
