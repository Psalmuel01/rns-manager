type BulkActionsProps = {
  addressButtonLabel: string;
  addressHelperText: string;
  isRenewing: boolean;
  isSettingAddr: boolean;
  newAddress: string;
  renewYears: string;
  selectedCount: number;
  onNewAddressChange: (value: string) => void;
  onRenew: () => void;
  onRenewYearsChange: (value: string) => void;
  onSetAddr: () => void;
};

export function BulkActions({
  addressButtonLabel,
  addressHelperText,
  isRenewing,
  isSettingAddr,
  newAddress,
  renewYears,
  selectedCount,
  onNewAddressChange,
  onRenew,
  onRenewYearsChange,
  onSetAddr
}: BulkActionsProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
      <h2 className="font-display text-2xl text-white">Bulk Actions</h2>
      <p className="text-sm text-steel">Operate on the selected domains.</p>

      <div className="mt-6 space-y-6">
        <div>
          <label className="text-xs uppercase tracking-wider text-steel">Set Address Record</label>
          <div className="mt-2 flex flex-wrap gap-3">
            <input
              value={newAddress}
              onChange={(event) => onNewAddressChange(event.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-2xl border border-white/10 bg-ink/60 px-4 py-3 text-sm text-white"
            />
            <button
              className="rounded-2xl bg-sun px-5 py-3 text-sm font-semibold text-ink"
              onClick={onSetAddr}
              disabled={!selectedCount || isSettingAddr}
            >
              {isSettingAddr ? "Setting..." : addressButtonLabel}
            </button>
          </div>
          <p className="mt-2 text-xs text-steel">{addressHelperText}</p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-steel">Renew Selected</label>
          <div className="mt-2 flex flex-wrap gap-3">
            <input
              value={renewYears}
              onChange={(event) => onRenewYearsChange(event.target.value)}
              className="w-24 rounded-2xl border border-white/10 bg-ink/60 px-3 py-3 text-sm text-white"
              placeholder="Years"
            />
            <button
              className="rounded-2xl border border-white/20 px-5 py-3 text-sm text-white"
              onClick={onRenew}
              disabled={!selectedCount || isRenewing}
            >
              {isRenewing ? "Renewing..." : "Renew Selected"}
            </button>
          </div>
          <p className="mt-2 text-xs text-steel">
            Renewals are priced in RIF. Fund the bulk manager with RIF before renewing.
          </p>
        </div>
      </div>
    </div>
  );
}
