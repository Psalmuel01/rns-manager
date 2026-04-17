type RegisterPanelProps = {
  canCommit: boolean;
  canRegister: boolean;
  commitDuration: string;
  commitLabels: string;
  countdownText: string | null;
  isCommitting: boolean;
  isRegistering: boolean;
  onCommit: () => void;
  onCommitDurationChange: (value: string) => void;
  onCommitLabelsChange: (value: string) => void;
  onRegister: () => void;
};

export function RegisterPanel({
  canCommit,
  canRegister,
  commitDuration,
  commitLabels,
  countdownText,
  isCommitting,
  isRegistering,
  onCommit,
  onCommitDurationChange,
  onCommitLabelsChange,
  onRegister
}: RegisterPanelProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
      <h2 className="font-display text-2xl text-white">Bulk Register</h2>
      <p className="text-sm text-steel">
        Commit and register labels in a two-step flow. Secrets are stored in your browser.
      </p>

      <textarea
        value={commitLabels}
        onChange={(event) => onCommitLabelsChange(event.target.value)}
        placeholder="label"
        className="mt-4 h-24 w-full rounded-2xl border border-white/10 bg-ink/60 p-4 text-sm text-white"
      />
      <p className="mt-2 text-xs text-steel">
        Commit/register uses labels only (no .rsk). Each label gets its own secret.
      </p>
      <p className="mt-2 text-xs text-steel">
        Registrations are paid in RIF. Fund the bulk manager address before registering.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <input
          value={commitDuration}
          onChange={(event) => onCommitDurationChange(event.target.value)}
          className="w-28 rounded-2xl border border-white/10 bg-ink/60 px-3 py-3 text-sm text-white"
          placeholder="Years"
        />
        <button
          className="rounded-2xl border border-white/20 px-4 py-3 text-sm text-white"
          onClick={onCommit}
          disabled={!canCommit || isCommitting}
        >
          {isCommitting ? "Committing..." : "Bulk Commit"}
        </button>
        <button
          className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink"
          onClick={onRegister}
          disabled={!canRegister || isRegistering}
        >
          {isRegistering ? "Registering..." : "Bulk Register"}
        </button>
      </div>

      {countdownText && <p className="mt-2 text-xs text-steel">{countdownText}</p>}

      <p className="mt-3 text-xs text-steel">
        Duration is in years. Registration uses the RSK Registrar token flow:
        `register(name, nameOwner, secret, duration)` encoded into a RIF `transferAndCall`.
      </p>
    </div>
  );
}
