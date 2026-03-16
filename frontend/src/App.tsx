import { useEffect, useMemo, useState } from "react";
import { Address, encodeFunctionData, formatUnits, isAddress } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient
} from "wagmi";
import { bulkManagerAbi } from "./abi/RNSBulkManager";
import { rnsRegistryAbi, rskOwnerAbi } from "./abi/rns";
import { rskRegistrarAbi, renewerAbi } from "./abi/registrar";
import { rifTokenAbi } from "./abi/rif";
import { fetchDomainsInfo, DomainRow } from "./lib/rnsActions";
import { labelhash, normalizeLabel } from "./lib/namehash";
import { encodeRegisterData, encodeRenewData } from "./lib/rnsEncoding";
import { RNS_ADDRESSES, BULK_MANAGER_ADDRESS } from "./lib/rnsConfig";
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

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${seconds}s (~${minutes}m)`;
}

export default function App() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [bulkAddress, setBulkAddress] = useState(BULK_MANAGER_ADDRESS);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [importText, setImportText] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [renewYears, setRenewYears] = useState("1");
  const [commitLabels, setCommitLabels] = useState("");
  const [commitDuration, setCommitDuration] = useState("1");
  const [commitments, setCommitments] = useState<Record<string, `0x${string}`>>({});
  const [secrets, setSecrets] = useState<Record<string, `0x${string}`>>({});
  const [approved, setApproved] = useState(false);
  const [rifBalance, setRifBalance] = useState<bigint | null>(null);
  const [isLoadingDomains, setIsLoadingDomains] = useState(false);
  const [minCommitmentAge, setMinCommitmentAge] = useState<number | null>(null);
  const [toasts, setToasts] = useState<
    { id: number; message: string; kind: "info" | "success" | "error" }[]
  >([]);

  const bulkManagerAddress = useMemo(() => {
    if (bulkAddress && isAddress(bulkAddress)) return bulkAddress as Address;
    return undefined;
  }, [bulkAddress]);
  const injectedConnector =
    connectors.find((connector) => connector.id === "injected") ?? connectors[0];

  function pushToast(message: string, kind: "info" | "success" | "error" = "info") {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  }

  const selected = domains.filter((domain) => domain.selected);
  const secretsKey = useMemo(
    () => (address ? `rns-bulk-secrets-${address.toLowerCase()}` : null),
    [address]
  );
  const commitmentsKey = useMemo(
    () => (address ? `rns-bulk-commitments-${address.toLowerCase()}` : null),
    [address]
  );

  useEffect(() => {
    if (!secretsKey || !commitmentsKey) {
      setSecrets({});
      setCommitments({});
      return;
    }
    try {
      const storedSecrets = localStorage.getItem(secretsKey);
      const storedCommitments = localStorage.getItem(commitmentsKey);
      setSecrets(storedSecrets ? JSON.parse(storedSecrets) : {});
      setCommitments(storedCommitments ? JSON.parse(storedCommitments) : {});
    } catch (error) {
      setSecrets({});
      setCommitments({});
    }
  }, [secretsKey, commitmentsKey]);

  useEffect(() => {
    if (!secretsKey) return;
    localStorage.setItem(secretsKey, JSON.stringify(secrets));
  }, [secretsKey, secrets]);

  useEffect(() => {
    if (!commitmentsKey) return;
    localStorage.setItem(commitmentsKey, JSON.stringify(commitments));
  }, [commitmentsKey, commitments]);

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

  useEffect(() => {
    if (!publicClient || !bulkManagerAddress) {
      setRifBalance(null);
      return;
    }

    publicClient
      .readContract({
        address: RNS_ADDRESSES.rifToken as Address,
        abi: rifTokenAbi,
        functionName: "balanceOf",
        args: [bulkManagerAddress]
      })
      .then((balance) => setRifBalance(balance as bigint))
      .catch(() => setRifBalance(null));
  }, [bulkManagerAddress, publicClient]);

  useEffect(() => {
    if (!publicClient) return;
    publicClient
      .readContract({
        address: RNS_ADDRESSES.rskRegistrar as Address,
        abi: rskRegistrarAbi,
        functionName: "minCommitmentAge"
      })
      .then((age) => setMinCommitmentAge(Number(age)))
      .catch(() => setMinCommitmentAge(null));
  }, [publicClient]);

  async function handleImport() {
    if (!publicClient) return;
    const labels = importText
      .split(/[\n,]/)
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (!labels.length) return;

    setIsLoadingDomains(true);
    pushToast("Loading domain data...");
    try {
      const rows = await fetchDomainsInfo(publicClient, labels);
      setDomains(rows);
      pushToast("Domains loaded.", "success");
    } catch (error) {
      pushToast("Failed to fetch domain data.", "error");
    } finally {
      setIsLoadingDomains(false);
    }
  }

  async function handleApproval() {
    if (!isConnected) {
      pushToast("Connect your wallet to approve the bulk manager.", "error");
      return;
    }
    if (!bulkManagerAddress) {
      pushToast("Enter a valid bulk manager address.", "error");
      return;
    }
    if (walletChainId && walletChainId !== rootstockTestnet.id) {
      pushToast("Wrong network. Switch to Rootstock Testnet (chain 31).", "error");
      return;
    }
    if (!walletClient) {
      pushToast("Wallet client not ready. Try reconnecting your wallet.", "error");
      return;
    }
    pushToast("Submitting approval transaction...");
    try {
      const hash = await walletClient.writeContract({
        address: RNS_ADDRESSES.registry as Address,
        abi: rnsRegistryAbi,
        functionName: "setApprovalForAll",
        args: [bulkManagerAddress, true]
      });
      setApproved(true);
      pushToast(`Approval submitted: ${shorten(hash)}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval failed.";
      pushToast(message, "error");
    }
  }

  async function handleSetAddr() {
    if (!walletClient || !bulkManagerAddress) return;
    if (!isAddress(newAddress)) {
      pushToast("Enter a valid address.", "error");
      return;
    }

    const nodes = selected.map((domain) => domain.node);
    const addrs = selected.map(() => newAddress as Address);

    pushToast("Submitting batch setAddr transaction...");
    try {
      const hash = await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "batchSetAddr",
        args: [nodes, addrs, true]
      });
      pushToast(`batchSetAddr submitted: ${shorten(hash)}`, "success");
    } catch (error) {
      pushToast("batchSetAddr failed.", "error");
    }
  }

  async function handleRenew() {
    if (!publicClient || !walletClient || !bulkManagerAddress) return;
    if (!selected.length) return;

    const durationYears = BigInt(Number(renewYears));
    if (durationYears <= 0n) {
      pushToast("Enter a valid duration in years.", "error");
      return;
    }

    const calls: { target: Address; value: bigint; data: `0x${string}` }[] = [];

    for (const domain of selected) {
      const expires =
        domain.expiresAt ??
        Number(
          await publicClient.readContract({
            address: RNS_ADDRESSES.rskOwner as Address,
            abi: rskOwnerAbi,
            functionName: "expirationTime",
            args: [BigInt(labelhash(domain.label))]
          })
        );

      const price = await publicClient.readContract({
        address: RNS_ADDRESSES.renewer as Address,
        abi: renewerAbi,
        functionName: "price",
        args: [domain.label, BigInt(expires), durationYears]
      });

      const renewData = encodeRenewData(domain.label, durationYears);
      const transferData = encodeFunctionData({
        abi: rifTokenAbi,
        functionName: "transferAndCall",
        args: [RNS_ADDRESSES.renewer as Address, price, renewData]
      });

      calls.push({
        target: RNS_ADDRESSES.rifToken as Address,
        value: 0n,
        data: transferData
      });
    }

    pushToast("Submitting batch renew transaction (RIF transferAndCall)...");
    try {
      const hash = await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "multicall",
        args: [calls, false]
      });
      pushToast(`batchRenew submitted: ${shorten(hash)}`, "success");
    } catch (error) {
      pushToast("batchRenew failed.", "error");
    }
  }

  async function handleCommit() {
    if (!publicClient || !walletClient || !bulkManagerAddress) return;

    const labels = commitLabels
      .split(/[\n,]/)
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (!labels.length) return;

    pushToast("Computing commitments...");

    const nextSecrets: Record<string, `0x${string}`> = { ...secrets };
    const commitmentsArray: `0x${string}`[] = [];

    for (const label of labels) {
      const secret = nextSecrets[label] || randomSecret();
      nextSecrets[label] = secret;

      const commitment = await publicClient.readContract({
        address: RNS_ADDRESSES.rskRegistrar as Address,
        abi: rskRegistrarAbi,
        functionName: "makeCommitment",
        args: [labelhash(label), address ?? ZERO_ADDRESS, secret]
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

    pushToast("Submitting bulk commit transaction...");
    try {
      const hash = await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "batchCommit",
        args: [commitmentsArray, false]
      });
      const waitText =
        minCommitmentAge !== null
          ? `Wait at least ${formatWait(minCommitmentAge)} before registering.`
          : "Wait minCommitmentAge before registering.";
      pushToast(`bulkCommit submitted: ${shorten(hash)}. ${waitText}`, "success");
    } catch (error) {
      pushToast("bulkCommit failed.", "error");
    }
  }

  async function handleRegister() {
    if (!publicClient || !walletClient || !bulkManagerAddress) return;

    const labels = commitLabels
      .split(/[\n,]/)
      .map((label) => normalizeLabel(label))
      .filter(Boolean);

    if (!labels.length) return;

    const durationYears = BigInt(Number(commitDuration));
    if (durationYears <= 0n) {
      pushToast("Enter a valid duration in years.", "error");
      return;
    }

    pushToast("Preparing register calls...");
    const calls: { target: Address; value: bigint; data: `0x${string}` }[] = [];

    for (const label of labels) {
      const secret = secrets[label];
      if (!secret) {
        pushToast(`Missing secret for ${label}. Commit first.`, "error");
        return;
      }

      const expires = await publicClient.readContract({
        address: RNS_ADDRESSES.rskOwner as Address,
        abi: rskOwnerAbi,
        functionName: "expirationTime",
        args: [BigInt(labelhash(label))]
      });

      const price = await publicClient.readContract({
        address: RNS_ADDRESSES.rskRegistrar as Address,
        abi: rskRegistrarAbi,
        functionName: "price",
        args: [label, expires, durationYears]
      });

      const registerData = encodeRegisterData(
        label,
        (address ?? ZERO_ADDRESS) as `0x${string}`,
        secret,
        durationYears
      );

      const transferData = encodeFunctionData({
        abi: rifTokenAbi,
        functionName: "transferAndCall",
        args: [RNS_ADDRESSES.rskRegistrar as Address, price, registerData]
      });

      calls.push({
        target: RNS_ADDRESSES.rifToken as Address,
        value: 0n,
        data: transferData
      });
    }

    pushToast("Submitting bulk register transaction (RIF transferAndCall)...");
    try {
      const hash = await walletClient.writeContract({
        address: bulkManagerAddress,
        abi: bulkManagerAbi,
        functionName: "multicall",
        args: [calls, false]
      });
      pushToast(`bulkRegister submitted: ${shorten(hash)}`, "success");
    } catch (error) {
      pushToast("bulkRegister failed.", "error");
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
    <div className="min-h-screen px-6 py-10 text-clay">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="font-display text-2xl text-white">RNS Bulk Manager</div>
            <div className="text-sm text-steel">Bulk tools for Rootstock Name Service</div>
          </div>
          <div className="text-xs text-steel">Rootstock Testnet</div>
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
                  onClick={() => injectedConnector && connect({ connector: injectedConnector })}
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
                disabled
              />
            </div>
            <button
              className="h-[52px] self-end rounded-2xl border border-white/20 px-5 text-sm text-white hover:border-sun hover:text-sun"
              onClick={handleApproval}
              disabled={
                !isConnected ||
                !bulkManagerAddress ||
                !walletClient ||
                (walletChainId !== undefined && walletChainId !== rootstockTestnet.id)
              }
            >
              {approved ? "Bulk Manager Approved" : "Approve Bulk Manager"}
            </button>
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
          {isConnected && bulkManagerAddress && !walletClient && (
            <p className="mt-2 text-xs text-steel">Wallet client not ready. Try reconnecting.</p>
          )}
          <p className="mt-3 text-xs text-steel">
            Approval grants this contract operator rights in the RNS registry so it can update
            resolver records on your behalf.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink/60 px-4 py-3 text-xs text-steel">
            <span>Bulk Manager RIF balance</span>
            <span className="text-white">
              {rifBalance !== null ? `${formatUnits(rifBalance, 18)} RIF` : "—"}
            </span>
          </div>
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
              <p className="mt-2 text-xs text-steel">
                Enter labels only (no .rsk). One per line or comma-separated.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-ink"
                  onClick={handleImport}
                  disabled={!publicClient || isLoadingDomains}
                >
                  {isLoadingDomains ? "Loading..." : "Load Domains"}
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
                        onChange={() => toggleSelect(index)}
                        className="h-4 w-4 accent-sun"
                      />
                    </td>
                    <td className="py-4 font-semibold">{domain.name}</td>
                    <td className="py-4 text-steel">
                      {domain.address && domain.address !== ZERO_ADDRESS ? (
                        <button
                          type="button"
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-steel hover:border-sun hover:text-sun"
                          onClick={() => {
                            navigator.clipboard.writeText(domain.address ?? "");
                            pushToast("Address copied.", "success");
                          }}
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
                        onClick={() => {
                          navigator.clipboard.writeText(domain.node);
                          pushToast("Namehash copied.", "success");
                        }}
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

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
            <h2 className="font-display text-2xl text-white">Bulk Actions</h2>
            <p className="text-sm text-steel">Operate on the selected domains.</p>

            <div className="mt-6 space-y-6">
              <div>
                <label className="text-xs uppercase tracking-wider text-steel">Set Address Record</label>
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
                <p className="mt-2 text-xs text-steel">
                  Writes the resolver address record for each selected name (requires registry approval).
                </p>
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
                  <button
                    className="rounded-2xl border border-white/20 px-5 py-3 text-sm text-white"
                    onClick={handleRenew}
                    disabled={!selected.length || !bulkManagerAddress}
                  >
                    Renew Selected
                  </button>
                </div>
                <p className="mt-2 text-xs text-steel">
                  Renewals are priced in RIF. Fund the bulk manager with RIF before renewing.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
            <h2 className="font-display text-2xl text-white">Bulk Register</h2>
            <p className="text-sm text-steel">
              Commit and register labels in a two-step flow. Secrets are stored in your browser.
            </p>

            <textarea
              value={commitLabels}
              onChange={(event) => setCommitLabels(event.target.value)}
              placeholder="alpha\nbeta\ngamma"
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
            {minCommitmentAge !== null && (
              <p className="mt-2 text-xs text-steel">
                Minimum wait after commit: {formatWait(minCommitmentAge)}.
              </p>
            )}
            <p className="mt-3 text-xs text-steel">
              Duration is in years. Registration uses the RSK Registrar token flow:
              `register(name, nameOwner, secret, duration)` encoded into a RIF `transferAndCall`.
            </p>
          </div>
        </section>

        {toasts.length > 0 && (
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
        )}

        <footer className="border-t border-white/10 pt-4 text-xs text-steel">
          RNS Bulk Manager · Chain ID 31 · RPC {rootstockTestnet.rpcUrls.default.http[0]}
        </footer>
      </div>
    </div>
  );
}
