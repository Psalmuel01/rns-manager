import { useEffect, useMemo, useState } from "react";
import { Address, encodeFunctionData, isAddress, parseEther } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient
} from "wagmi";
import { injected } from "wagmi/connectors";
import { bulkManagerAbi } from "./abi/RNSBulkManager";
import { rnsRegistryAbi } from "./abi/rns";
import { fetchDomainInfo, DomainRow } from "./lib/rnsActions";
import { normalizeLabel } from "./lib/namehash";
import { RNS_ADDRESSES, BULK_MANAGER_ADDRESS } from "./lib/rnsConfig";
import { rskRegistrarAbi, renewerAbi } from "./abi/registrar";
import { rootstockTestnet } from "./lib/chain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function shorten(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function randomSecret(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

export default function App() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [bulkAddress, setBulkAddress] = useState(BULK_MANAGER_ADDRESS);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [renewYears, setRenewYears] = useState("1");
  const [renewValue, setRenewValue] = useState("0");
  const [commitLabels, setCommitLabels] = useState("");
  const [commitDuration, setCommitDuration] = useState("1");
  const [commitments, setCommitments] = useState<Record<string, `0x${string}`>>({});
  const [secrets, setSecrets] = useState<Record<string, `0x${string}`>>({});
  const [approved, setApproved] = useState(false);

  const bulkManagerAddress = useMemo(() => {
    if (bulkAddress && isAddress(bulkAddress)) return bulkAddress as Address;
    return undefined;
  }, [bulkAddress]);

  const selected = domains.filter((domain) => domain.selected);

  useEffect(() => {
    async function checkApproval() {
      if (!publicClient || !address || !bulkManagerAddress) return;
      const approved = await publicClient.readContract({
        address: RNS_ADDRESSES.registry as Address,
        abi: rnsRegistryAbi,
        functionName: "isApprovedForAll",
        args: [address, bulkManagerAddress]
      });
      setApproved(approved);
    }

    checkApproval().catch(() => setApproved(false));
  }, [address, bulkManagerAddress, publicClient]);

  async function handleImport() {
    if (!publicClient) return;
    const labels = importText
      .split(/[\n,]/)
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (!labels.length) return;

    setStatus("Loading domain data...");
    try {
      const rows = await Promise.all(labels.map((label) => fetchDomainInfo(publicClient, label)));
      setDomains(rows);
      setStatus(null);
    } catch (error) {
      setStatus("Failed to fetch domain data.");
    }
  }

  async function handleApproval() {
    if (!walletClient || !bulkManagerAddress) return;
    setStatus("Submitting approval transaction...");
    try {
      await walletClient.writeContract({
        address: RNS_ADDRESSES.registry as Address,
        abi: rnsRegistryAbi,
        functionName: "setApprovalForAll",
        args: [bulkManagerAddress, true]
      });
      setApproved(true);
      setStatus("Bulk manager approved.");
    } catch (error) {
      setStatus("Approval failed.");
    }
  }

  async function handleSetAddr() {
    if (!walletClient || !bulkManagerAddress) return;
    if (!isAddress(newAddress)) {
      setStatus("Enter a valid address.");
      return;
    }

    const nodes = selected.map((domain) => domain.node);
    const addrs = selected.map(() => newAddress as Address);

    setStatus("Submitting batch setAddr transaction...");
    try {
      await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "batchSetAddr",
        args: [nodes, addrs, true]
      });
      setStatus("batchSetAddr submitted.");
    } catch (error) {
      setStatus("batchSetAddr failed.");
    }
  }

  async function handleRenew() {
    if (!walletClient || !bulkManagerAddress) return;
    if (!selected.length) return;

    const duration = BigInt(Number(renewYears) * 31_536_000);
    const valuePerDomain = Number(renewValue || "0");
    const values = selected.map(() => (valuePerDomain ? parseEther(valuePerDomain.toString()) : 0n));
    const data = selected.map((domain) =>
      encodeFunctionData({
        abi: renewerAbi,
        functionName: "renew",
        args: [domain.label, duration]
      })
    );

    setStatus("Submitting batch renew transaction...");
    try {
      await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "batchRenew",
        args: [data, values, false],
        value: values.reduce((sum, val) => sum + val, 0n)
      });
      setStatus("batchRenew submitted.");
    } catch (error) {
      setStatus("batchRenew failed.");
    }
  }

  async function handleCommit() {
    if (!publicClient || !walletClient || !bulkManagerAddress) return;

    const labels = commitLabels
      .split(/[\n,]/)
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (!labels.length) return;

    setStatus("Computing commitments...");

    const nextSecrets: Record<string, `0x${string}`> = { ...secrets };
    const commitmentsArray: `0x${string}`[] = [];

    for (const label of labels) {
      const secret = nextSecrets[label] || randomSecret();
      nextSecrets[label] = secret;

      const commitment = await publicClient.readContract({
        address: RNS_ADDRESSES.rskRegistrar as Address,
        abi: rskRegistrarAbi,
        functionName: "makeCommitment",
        args: [label, address ?? ZERO_ADDRESS, secret]
      });

      commitmentsArray.push(commitment);
    }

    setSecrets(nextSecrets);
    setCommitments((prev) => ({
      ...prev,
      ...labels.reduce((acc, label, index) => {
        acc[label] = commitmentsArray[index];
        return acc;
      }, {} as Record<string, `0x${string}`>)
    }));

    setStatus("Submitting bulk commit transaction...");
    try {
      await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "batchCommit",
        args: [commitmentsArray, false]
      });
      setStatus("bulkCommit submitted. Wait minCommitmentAge before registering.");
    } catch (error) {
      setStatus("bulkCommit failed.");
    }
  }

  async function handleRegister() {
    if (!publicClient || !walletClient || !bulkManagerAddress) return;

    const labels = commitLabels
      .split(/[\n,]/)
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (!labels.length) return;

    const duration = BigInt(Number(commitDuration) * 31_536_000);

    setStatus("Preparing register calls...");
    const data: `0x${string}`[] = [];
    const values: bigint[] = [];

    for (const label of labels) {
      const secret = secrets[label];
      if (!secret) {
        setStatus(`Missing secret for ${label}. Commit first.`);
        return;
      }

      const price = await publicClient.readContract({
        address: RNS_ADDRESSES.rskRegistrar as Address,
        abi: rskRegistrarAbi,
        functionName: "price",
        args: [label, duration]
      });

      data.push(
        encodeFunctionData({
          abi: rskRegistrarAbi,
          functionName: "register",
          args: [label, address ?? ZERO_ADDRESS, secret, duration, price]
        })
      );

      values.push(0n);
    }

    setStatus("Submitting bulk register transaction...");
    try {
      await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "batchRegister",
        args: [data, values, false]
      });
      setStatus("bulkRegister submitted.");
    } catch (error) {
      setStatus("bulkRegister failed.");
    }
  }

  function toggleSelect(index: number) {
    setDomains((prev) =>
      prev.map((domain, idx) => (idx === index ? { ...domain, selected: !domain.selected } : domain))
    );
  }

  function toggleAll(selected: boolean) {
    setDomains((prev) => prev.map((domain) => ({ ...domain, selected })));
  }

  return (
    <div className="min-h-screen px-6 py-12 text-clay">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-3 rounded-full border border-sun/40 bg-sun/10 px-4 py-1 text-sm uppercase tracking-[0.2em] text-sun">
            RNS Bulk Manager
          </div>
          <h1 className="font-display text-4xl text-white md:text-5xl">
            Power-user controls for Rootstock Name Service domains
          </h1>
          <p className="max-w-2xl text-lg text-steel">
            Batch commit, register, renew, and update resolver records across many RNS domains in a
            single transaction. Designed for portfolio managers, infra teams, and domain power users.
          </p>
        </header>

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
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  className="rounded-full bg-sun px-6 py-2 text-sm font-semibold text-ink shadow-glow"
                  onClick={() => connect({ connector: injected() })}
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="text-xs uppercase tracking-wider text-steel">
                Bulk Manager Address
              </label>
              <input
                value={bulkAddress}
                onChange={(event) => setBulkAddress(event.target.value)}
                placeholder="0x..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-ink/60 px-4 py-3 text-sm text-white"
              />
            </div>
            <button
              className="h-[52px] self-end rounded-2xl border border-white/20 px-5 text-sm text-white hover:border-sun hover:text-sun"
              onClick={handleApproval}
              disabled={!isConnected || !bulkManagerAddress}
            >
              {approved ? "Bulk Manager Approved" : "Approve Bulk Manager"}
            </button>
          </div>
          <p className="mt-3 text-xs text-steel">
            Approval grants this contract operator rights in the RNS registry so it can update
            resolver records on your behalf.
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 className="font-display text-2xl text-white">Domain Portfolio</h2>
              <p className="text-sm text-steel">
                Paste your RNS labels to load live resolver and expiry data.
              </p>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="mywallet\nteam\nrouter"
                className="mt-4 h-28 w-full rounded-2xl border border-white/10 bg-ink/60 p-4 text-sm text-white"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-ink"
                  onClick={handleImport}
                  disabled={!publicClient}
                >
                  Load Domains
                </button>
                <button
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white"
                  onClick={() => toggleAll(true)}
                >
                  Select All
                </button>
                <button
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white"
                  onClick={() => toggleAll(false)}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-ink/60 p-4 text-sm text-steel">
              <div className="font-semibold text-white">Selected</div>
              <div className="mt-2 text-3xl font-display text-sun">{selected.length}</div>
              <div className="mt-6 space-y-2 text-xs">
                <div>Registry: {shorten(RNS_ADDRESSES.registry)}</div>
                <div>Resolver: {shorten(RNS_ADDRESSES.resolver)}</div>
                <div>RSK Owner: {shorten(RNS_ADDRESSES.rskOwner)}</div>
              </div>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-steel">
                <tr>
                  <th className="pb-3">Select</th>
                  <th className="pb-3">Domain</th>
                  <th className="pb-3">Resolver Addr</th>
                  <th className="pb-3">Expiry</th>
                  <th className="pb-3">Node</th>
                </tr>
              </thead>
              <tbody className="text-white">
                {domains.map((domain, index) => (
                  <tr key={domain.name} className="border-t border-white/10">
                    <td className="py-4">
                      <input
                        type="checkbox"
                        checked={domain.selected}
                        onChange={() => toggleSelect(index)}
                        className="h-4 w-4 accent-sun"
                      />
                    </td>
                    <td className="py-4 font-semibold">{domain.name}</td>
                    <td className="py-4 text-steel">
                      {domain.address && domain.address !== ZERO_ADDRESS
                        ? shorten(domain.address)
                        : "—"}
                    </td>
                    <td className="py-4 text-steel">
                      {domain.expiresAt ? new Date(domain.expiresAt * 1000).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-4 text-xs text-steel">{shorten(domain.node)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
            <h2 className="font-display text-2xl text-white">Bulk Actions</h2>
            <p className="text-sm text-steel">Operate on the selected domains.</p>

            <div className="mt-6 space-y-6">
              <div>
                <label className="text-xs uppercase tracking-wider text-steel">Set Resolver Address</label>
                <div className="mt-2 flex flex-wrap gap-3">
                  <input
                    value={newAddress}
                    onChange={(event) => setNewAddress(event.target.value)}
                    placeholder="0x..."
                    className="flex-1 rounded-2xl border border-white/10 bg-ink/60 px-4 py-3 text-sm text-white"
                  />
                  <button
                    className="rounded-2xl bg-sun px-5 py-3 text-sm font-semibold text-ink"
                    onClick={handleSetAddr}
                    disabled={!selected.length || !bulkManagerAddress}
                  >
                    Set Address
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-steel">Renew Selected</label>
                <div className="mt-2 flex flex-wrap gap-3">
                  <input
                    value={renewYears}
                    onChange={(event) => setRenewYears(event.target.value)}
                    className="w-24 rounded-2xl border border-white/10 bg-ink/60 px-3 py-3 text-sm text-white"
                    placeholder="Years"
                  />
                  <input
                    value={renewValue}
                    onChange={(event) => setRenewValue(event.target.value)}
                    className="w-32 rounded-2xl border border-white/10 bg-ink/60 px-3 py-3 text-sm text-white"
                    placeholder="RBTC value"
                  />
                  <button
                    className="rounded-2xl border border-white/20 px-5 py-3 text-sm text-white"
                    onClick={handleRenew}
                    disabled={!selected.length || !bulkManagerAddress}
                  >
                    Renew Selected
                  </button>
                </div>
                <p className="mt-2 text-xs text-steel">
                  If renewals are priced in RIF, make sure the bulk manager is funded and approved.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
            <h2 className="font-display text-2xl text-white">Bulk Register</h2>
            <p className="text-sm text-steel">
              Commit and register labels in a two-step flow. Secrets are stored locally in memory.
            </p>

            <textarea
              value={commitLabels}
              onChange={(event) => setCommitLabels(event.target.value)}
              placeholder="alpha\nbeta\ngamma"
              className="mt-4 h-24 w-full rounded-2xl border border-white/10 bg-ink/60 p-4 text-sm text-white"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                value={commitDuration}
                onChange={(event) => setCommitDuration(event.target.value)}
                className="w-28 rounded-2xl border border-white/10 bg-ink/60 px-3 py-3 text-sm text-white"
                placeholder="Years"
              />
              <button
                className="rounded-2xl border border-white/20 px-4 py-3 text-sm text-white"
                onClick={handleCommit}
                disabled={!isConnected || !bulkManagerAddress}
              >
                Bulk Commit
              </button>
              <button
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink"
                onClick={handleRegister}
                disabled={!isConnected || !bulkManagerAddress}
              >
                Bulk Register
              </button>
            </div>
            <p className="mt-3 text-xs text-steel">
              Register uses the RSKRegistrar ABI: `register(label, owner, secret, duration, price)`.
              Adjust the ABI if your registrar differs.
            </p>
          </div>
        </section>

        {status && (
          <div className="rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-sm text-white">
            {status}
          </div>
        )}

        <footer className="text-xs text-steel">
          Network: Rootstock Testnet · Chain ID 31 · RPC {rootstockTestnet.rpcUrls.default.http[0]}
        </footer>
      </div>
    </div>
  );
}
