import { DomainRow } from "../lib/rnsActions";

type DomainTableProps = {
  domains: DomainRow[];
  importText: string;
  isLoadingDomains: boolean;
  onCopy: (value: string, label: string) => void;
  onImport: () => void;
  onImportTextChange: (value: string) => void;
  onToggleAll: (selected: boolean) => void;
  onToggleSelect: (index: number) => void;
  selectedCount: number;
  shorten: (value?: string) => string;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function DomainTable({
  domains,
  importText,
  isLoadingDomains,
  onCopy,
  onImport,
  onImportTextChange,
  onToggleAll,
  onToggleSelect,
  selectedCount,
  shorten
}: DomainTableProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="font-display text-2xl text-white">Domain Portfolio</h2>
          <p className="text-sm text-steel">Paste your RNS labels to load live resolver and expiry data.</p>
          <textarea
            value={importText}
            onChange={(event) => onImportTextChange(event.target.value)}
            placeholder="label"
            className="mt-4 h-28 w-full rounded-2xl border border-white/10 bg-ink/60 p-4 text-sm text-white"
          />
          <p className="mt-2 text-xs text-steel">
            Enter labels only (no .rsk). One per line or comma-separated.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-ink"
              onClick={onImport}
              disabled={isLoadingDomains}
            >
              {isLoadingDomains ? "Loading..." : "Load Domains"}
            </button>
            <button
              className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white"
              onClick={() => onToggleAll(true)}
            >
              Select All
            </button>
            <button
              className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white"
              onClick={() => onToggleAll(false)}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink/60 p-4 text-sm text-steel">
          <div className="font-semibold text-white">Selected</div>
          <div className="mt-2 text-3xl font-display text-sun">{selectedCount}</div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-steel">
            <tr>
              <th className="pb-3">Select</th>
              <th className="pb-3">Domain</th>
              <th className="pb-3">Resolved Addr</th>
              <th className="pb-3">Expiry</th>
              <th className="pb-3">Namehash</th>
            </tr>
          </thead>
          <tbody className="text-white">
            {domains.map((domain, index) => (
              <tr key={domain.name} className="border-t border-white/10">
                <td className="py-4">
                  <input
                    type="checkbox"
                    checked={domain.selected}
                    onChange={() => onToggleSelect(index)}
                    className="h-4 w-4 accent-sun"
                  />
                </td>
                <td className="py-4 font-semibold">{domain.name}</td>
                <td className="py-4 text-steel">
                  {domain.address && domain.address !== ZERO_ADDRESS ? (
                    <button
                      type="button"
                      className="rounded-full border border-white/10 px-3 py-1 text-xs text-steel hover:border-sun hover:text-sun"
                      onClick={() => onCopy(domain.address ?? "", "Address")}
                      title="Copy address"
                    >
                      {shorten(domain.address)}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-4 text-steel">
                  {domain.expiresAt ? new Date(domain.expiresAt * 1000).toLocaleDateString() : "—"}
                </td>
                <td className="py-4 text-xs text-steel">
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-steel hover:border-sun hover:text-sun"
                    onClick={() => onCopy(domain.node, "Namehash")}
                    title="Copy namehash"
                  >
                    {shorten(domain.node)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
