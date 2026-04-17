import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Address, encodeFunctionData, formatUnits, isAddress } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useWalletClient
} from "wagmi";
import { bulkManagerAbi } from "./abi/RNSBulkManager";
import { rnsRegistryAbi, rskOwnerAbi, rnsResolverAbi } from "./abi/rns";
import { renewerAbi, rskRegistrarAbi } from "./abi/registrar";
import { rifTokenAbi } from "./abi/rif";
import { BulkActions } from "./components/BulkActions";
import { DomainTable } from "./components/DomainTable";
import { RegisterPanel } from "./components/RegisterPanel";
import { ToastViewport } from "./components/ToastViewport";
import { WalletSection } from "./components/WalletSection";
import { useDomainPortfolio } from "./hooks/useDomainPortfolio";
import { usePersistentRecord } from "./hooks/usePersistentRecord";
import { useToasts } from "./hooks/useToasts";
import { useTransactionSubmission } from "./hooks/useTransactionSubmission";
import { getErrorMessage } from "./lib/errors";
import { labelhash, normalizeLabel } from "./lib/namehash";
import { BULK_MANAGER_ADDRESS, RNS_ADDRESSES } from "./lib/rnsConfig";
import { rootstockTestnet } from "./lib/chain";
import { encodeRegisterData, encodeRenewData } from "./lib/rnsEncoding";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function shorten(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function randomSecret(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${seconds}s (~${minutes}m)`;
}

function parseLabels(input: string) {
  return input
    .split(/[\n,]/)
    .map((label) => normalizeLabel(label))
    .filter(Boolean);
}

export default function App() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { toasts, pushToast } = useToasts();
  const submitTx = useTransactionSubmission(publicClient, pushToast);
  const { domains, selected, isLoadingDomains, loadDomains, refreshDomains, toggleAll, toggleSelect } =
    useDomainPortfolio(pushToast);

  const [bulkAddress, setBulkAddress] = useState(BULK_MANAGER_ADDRESS);
  const [importText, setImportText] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [renewYears, setRenewYears] = useState("1");
  const [commitLabels, setCommitLabels] = useState("");
  const [commitDuration, setCommitDuration] = useState("1");
  const [isApproving, setIsApproving] = useState(false);
  const [isSettingAddr, setIsSettingAddr] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [commitWaitEndsAt, setCommitWaitEndsAt] = useState<number | null>(null);
  const [nowSeconds, setNowSeconds] = useState<number>(Math.floor(Date.now() / 1000));

  const bulkAddressLocked = Boolean(BULK_MANAGER_ADDRESS);
  const bulkManagerAddress = useMemo(() => {
    if (bulkAddress && isAddress(bulkAddress)) return bulkAddress as Address;
    return undefined;
  }, [bulkAddress]);
  const injectedConnector =
    connectors.find((connector) => connector.id === "injected") ?? connectors[0];

  const secretsKey = useMemo(
    () => (address ? `rns-bulk-secrets-${address.toLowerCase()}` : null),
    [address]
  );
  const commitmentsKey = useMemo(
    () => (address ? `rns-bulk-commitments-${address.toLowerCase()}` : null),
    [address]
  );
  const [secrets, setSecrets] = usePersistentRecord<Record<string, `0x${string}`>>(secretsKey);
  const [commitments, setCommitments] =
    usePersistentRecord<Record<string, `0x${string}`>>(commitmentsKey);

  const approvalQuery = useQuery({
    queryKey: ["registry-approval", address, bulkManagerAddress],
    enabled: Boolean(publicClient && address && bulkManagerAddress),
    queryFn: async () => {
      try {
        const approved = await publicClient!.readContract({
          address: RNS_ADDRESSES.registry as Address,
          abi: rnsRegistryAbi,
          functionName: "isApprovedForAll",
          args: [address!, bulkManagerAddress!]
        });
        return { supported: true, approved };
      } catch {
        return { supported: false, approved: false };
      }
    }
  });

  const rifBalanceQuery = useQuery({
    queryKey: ["rif-balance", bulkManagerAddress],
    enabled: Boolean(publicClient && bulkManagerAddress),
    queryFn: async () =>
      (await publicClient!.readContract({
        address: RNS_ADDRESSES.rifToken as Address,
        abi: rifTokenAbi,
        functionName: "balanceOf",
        args: [bulkManagerAddress!]
      })) as bigint
  });

  const minCommitmentAgeQuery = useQuery({
    queryKey: ["min-commitment-age"],
    enabled: Boolean(publicClient),
    queryFn: async () =>
      Number(
        await publicClient!.readContract({
          address: RNS_ADDRESSES.rskRegistrar as Address,
          abi: rskRegistrarAbi,
          functionName: "minCommitmentAge"
        })
      )
  });

  const supportsRegistryApproval = approvalQuery.data?.supported ?? true;
  const approved = approvalQuery.data?.approved ?? false;
  const minCommitmentAge = minCommitmentAgeQuery.data ?? null;
  const rifBalanceLabel =
    rifBalanceQuery.data !== undefined ? `${formatUnits(rifBalanceQuery.data, 18)} RIF` : "—";

  useEffect(() => {
    if (!commitWaitEndsAt) return;

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setNowSeconds(now);
      if (now >= commitWaitEndsAt) {
        setCommitWaitEndsAt(null);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [commitWaitEndsAt]);

  const countdownText = useMemo(() => {
    if (minCommitmentAge === null) return null;
    if (commitWaitEndsAt && commitWaitEndsAt > nowSeconds) {
      return `Minimum wait after commit: ${commitWaitEndsAt - nowSeconds}s remaining.`;
    }
    return `Minimum wait after commit: ${formatWait(minCommitmentAge)}.`;
  }, [commitWaitEndsAt, minCommitmentAge, nowSeconds]);

  async function loadCurrentAndNewLabels(labels: string[]) {
    if (!publicClient) return;
    const allLabels = Array.from(new Set([...domains.map((domain) => domain.label), ...labels]));
    await loadDomains(publicClient, allLabels);
  }

  async function fetchExpiries(labels: string[], fallbackExpiries = new Map<string, number | undefined>()) {
    if (!publicClient) throw new Error("Public client not ready.");

    const results = await publicClient.multicall({
      allowFailure: true,
      contracts: labels.map((label) => ({
        address: RNS_ADDRESSES.rskOwner as Address,
        abi: rskOwnerAbi,
        functionName: "expirationTime",
        args: [BigInt(labelhash(label))]
      }))
    });

    return results.map((result, index) => {
      if (result.status === "success") return result.result as bigint;

      const fallback = fallbackExpiries.get(labels[index]);
      if (fallback !== undefined) return BigInt(fallback);

      throw new Error(`Could not fetch expiry for ${labels[index]}.`);
    });
  }

  async function copyValue(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    pushToast(`${label} copied.`, "success");
  }

  async function handleImport() {
    if (!publicClient) {
      pushToast("Public client not ready.", "error");
      return;
    }

    const labels = parseLabels(importText);
    if (!labels.length) {
      pushToast("Enter at least one label.", "error");
      return;
    }

    await loadDomains(publicClient, labels);
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
    if (!supportsRegistryApproval) {
      pushToast("Registry approvals are not supported on this network.", "error");
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

    await submitTx(
      "Approval",
      () =>
        walletClient.writeContract({
          address: RNS_ADDRESSES.registry as Address,
          abi: rnsRegistryAbi,
          functionName: "setApprovalForAll",
          args: [bulkManagerAddress, true]
        }),
      {
        onSuccess: async () => {
          await approvalQuery.refetch();
        },
        setLoading: setIsApproving
      }
    );
  }

  async function handleSetAddr() {
    if (!walletClient) {
      pushToast("Wallet client not ready.", "error");
      return;
    }
    if (!isAddress(newAddress)) {
      pushToast("Enter a valid address.", "error");
      return;
    }
    if (!selected.length) {
      pushToast("Select at least one name.", "error");
      return;
    }

    if (supportsRegistryApproval && bulkManagerAddress && approved) {
      await submitTx(
        selected.length > 1 ? "Batch Set Address" : "Set Address",
        () =>
          walletClient.writeContract({
            address: bulkManagerAddress,
            abi: bulkManagerAbi,
            functionName: "batchSetAddr",
            args: [selected.map((domain) => domain.node), selected.map(() => newAddress as Address), true]
          }),
        {
          onSuccess: async () => {
            await refreshDomains(publicClient!);
          },
          setLoading: setIsSettingAddr
        }
      );
      return;
    }

    if (selected.length !== 1) {
      pushToast("On this registry, set address uses your wallet directly. Select exactly one name.", "error");
      return;
    }

    const resolver = selected[0].resolver;
    if (!resolver || resolver === ZERO_ADDRESS) {
      pushToast("Resolver is not set for this name.", "error");
      return;
    }

    await submitTx(
      "Set Address",
      () =>
        walletClient.writeContract({
          address: resolver,
          abi: rnsResolverAbi,
          functionName: "setAddr",
          args: [selected[0].node, newAddress as Address]
        }),
      {
        onSuccess: async () => {
          await refreshDomains(publicClient!);
        },
        setLoading: setIsSettingAddr
      }
    );
  }

  async function handleRenew() {
    if (!publicClient || !walletClient || !bulkManagerAddress) {
      pushToast("Connect your wallet and enter a valid bulk manager address.", "error");
      return;
    }
    if (!selected.length) {
      pushToast("Select at least one name to renew.", "error");
      return;
    }

    const durationYears = BigInt(Number(renewYears));
    if (durationYears <= 0n) {
      pushToast("Enter a valid duration in years.", "error");
      return;
    }

    try {
      const expiries = await fetchExpiries(
        selected.map((domain) => domain.label),
        new Map(selected.map((domain) => [domain.label, domain.expiresAt]))
      );

      const priceResults = await publicClient.multicall({
        allowFailure: true,
        contracts: selected.map((domain, index) => ({
          address: RNS_ADDRESSES.renewer as Address,
          abi: renewerAbi,
          functionName: "price",
          args: [domain.label, expiries[index], durationYears]
        }))
      });

      const calls = selected.map((domain, index) => {
        const priceResult = priceResults[index];
        if (priceResult.status !== "success") {
          throw new Error(`Could not calculate renewal price for ${domain.label}.`);
        }

        const transferData = encodeFunctionData({
          abi: rifTokenAbi,
          functionName: "transferAndCall",
          args: [
            RNS_ADDRESSES.renewer as Address,
            priceResult.result as bigint,
            encodeRenewData(domain.label, durationYears)
          ]
        });

        return {
          target: RNS_ADDRESSES.rifToken as Address,
          value: 0n,
          data: transferData
        };
      });

      await submitTx(
        "Renew",
        () =>
          walletClient.writeContract({
            address: bulkManagerAddress,
            abi: bulkManagerAbi,
            functionName: "multicall",
            args: [calls, true]
          }),
        {
          onSuccess: async () => {
            await refreshDomains(publicClient);
          },
          setLoading: setIsRenewing
        }
      );
    } catch (error) {
      pushToast(getErrorMessage(error, "Renew failed."), "error");
    }
  }

  async function handleCommit() {
    if (!publicClient || !walletClient || !bulkManagerAddress) {
      pushToast("Connect your wallet and enter a valid bulk manager address.", "error");
      return;
    }

    const labels = parseLabels(commitLabels);
    if (!labels.length) {
      pushToast("Enter at least one label to commit.", "error");
      return;
    }

    const nextSecrets = { ...secrets };
    labels.forEach((label) => {
      nextSecrets[label] = nextSecrets[label] || randomSecret();
    });

    try {
      const commitmentResults = await publicClient.multicall({
        allowFailure: true,
        contracts: labels.map((label) => ({
          address: RNS_ADDRESSES.rskRegistrar as Address,
          abi: rskRegistrarAbi,
          functionName: "makeCommitment",
          args: [labelhash(label), (address ?? ZERO_ADDRESS) as `0x${string}`, nextSecrets[label]]
        }))
      });

      const nextCommitments = { ...commitments };
      const commitmentArray = commitmentResults.map((result, index) => {
        if (result.status !== "success") {
          throw new Error(`Could not compute commitment for ${labels[index]}.`);
        }

        const commitment = result.result as unknown as `0x${string}`;
        nextCommitments[labels[index]] = commitment;
        return commitment;
      });

      setSecrets(nextSecrets);
      setCommitments(nextCommitments);

      await submitTx(
        "Bulk Commit",
        () =>
          walletClient.writeContract({
            address: bulkManagerAddress,
            abi: bulkManagerAbi,
            functionName: "batchCommit",
            args: [commitmentArray, true]
          }),
        {
          onSuccess: () => {
            if (minCommitmentAge !== null) {
              setCommitWaitEndsAt(Math.floor(Date.now() / 1000) + minCommitmentAge);
              pushToast(`Wait at least ${formatWait(minCommitmentAge)} before registering.`, "info");
            } else {
              pushToast("Commit confirmed. Wait for the registrar minimum age before registering.", "info");
            }
          },
          setLoading: setIsCommitting
        }
      );
    } catch (error) {
      pushToast(getErrorMessage(error, "Commit failed."), "error");
    }
  }

  async function handleRegister() {
    if (!publicClient || !walletClient || !bulkManagerAddress) {
      pushToast("Connect your wallet and enter a valid bulk manager address.", "error");
      return;
    }

    const labels = parseLabels(commitLabels);
    if (!labels.length) {
      pushToast("Enter at least one label to register.", "error");
      return;
    }

    const durationYears = BigInt(Number(commitDuration));
    if (durationYears <= 0n) {
      pushToast("Enter a valid duration in years.", "error");
      return;
    }

    try {
      const expiries = await fetchExpiries(labels);
      const priceResults = await publicClient.multicall({
        allowFailure: true,
        contracts: labels.map((label, index) => ({
          address: RNS_ADDRESSES.rskRegistrar as Address,
          abi: rskRegistrarAbi,
          functionName: "price",
          args: [label, expiries[index], durationYears]
        }))
      });

      const calls = labels.map((label, index) => {
        const secret = secrets[label];
        if (!secret) {
          throw new Error(`Missing secret for ${label}. Commit first.`);
        }

        const priceResult = priceResults[index];
        if (priceResult.status !== "success") {
          throw new Error(`Could not calculate registration price for ${label}.`);
        }

        const transferData = encodeFunctionData({
          abi: rifTokenAbi,
          functionName: "transferAndCall",
          args: [
            RNS_ADDRESSES.rskRegistrar as Address,
            priceResult.result as bigint,
            encodeRegisterData(label, (address ?? ZERO_ADDRESS) as `0x${string}`, secret, durationYears)
          ]
        });

        return {
          target: RNS_ADDRESSES.rifToken as Address,
          value: 0n,
          data: transferData
        };
      });

      await submitTx(
        "Bulk Register",
        () =>
          walletClient.writeContract({
            address: bulkManagerAddress,
            abi: bulkManagerAbi,
            functionName: "multicall",
            args: [calls, true]
          }),
        {
          onSuccess: async () => {
            await loadCurrentAndNewLabels(labels);
          },
          setLoading: setIsRegistering
        }
      );
    } catch (error) {
      pushToast(getErrorMessage(error, "Register failed."), "error");
    }
  }

  const addressButtonLabel =
    supportsRegistryApproval && bulkManagerAddress && approved && selected.length > 1
      ? "Batch Set Address"
      : "Set Address";
  const addressHelperText =
    supportsRegistryApproval && bulkManagerAddress && approved
      ? "When registry approvals are supported, multiple selected names can be updated through the bulk manager."
      : "This testnet registry does not support operator approvals, so address updates are sent directly from your wallet one name at a time.";

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

        <WalletSection
          address={address}
          approved={approved}
          bulkAddress={bulkAddress}
          bulkAddressLocked={bulkAddressLocked}
          bulkManagerAddress={bulkManagerAddress}
          isApproving={isApproving}
          isConnected={isConnected}
          rifBalanceLabel={rifBalanceLabel}
          supportsRegistryApproval={supportsRegistryApproval}
          walletClientReady={Boolean(walletClient)}
          walletChainId={walletChainId}
          onApprove={handleApproval}
          onBulkAddressChange={setBulkAddress}
          onConnect={() => injectedConnector && connect({ connector: injectedConnector })}
          onDisconnect={() => disconnect()}
          shorten={shorten}
        />

        <DomainTable
          domains={domains}
          importText={importText}
          isLoadingDomains={isLoadingDomains}
          onCopy={copyValue}
          onImport={handleImport}
          onImportTextChange={setImportText}
          onToggleAll={toggleAll}
          onToggleSelect={toggleSelect}
          selectedCount={selected.length}
          shorten={shorten}
        />

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <BulkActions
            addressButtonLabel={addressButtonLabel}
            addressHelperText={addressHelperText}
            isRenewing={isRenewing}
            isSettingAddr={isSettingAddr}
            newAddress={newAddress}
            renewYears={renewYears}
            selectedCount={selected.length}
            onNewAddressChange={setNewAddress}
            onRenew={handleRenew}
            onRenewYearsChange={setRenewYears}
            onSetAddr={handleSetAddr}
          />

          <RegisterPanel
            canCommit={isConnected && Boolean(bulkManagerAddress)}
            canRegister={isConnected && Boolean(bulkManagerAddress)}
            commitDuration={commitDuration}
            commitLabels={commitLabels}
            countdownText={countdownText}
            isCommitting={isCommitting}
            isRegistering={isRegistering}
            onCommit={handleCommit}
            onCommitDurationChange={setCommitDuration}
            onCommitLabelsChange={setCommitLabels}
            onRegister={handleRegister}
          />
        </section>

        <ToastViewport toasts={toasts} />

        <footer className="border-t border-white/10 pt-4 text-xs text-steel">
          RNS Bulk Manager · Chain ID 31 · RPC {rootstockTestnet.rpcUrls.default.http[0]}
        </footer>
      </div>
    </div>
  );
}
