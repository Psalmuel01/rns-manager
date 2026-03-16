import { Address, PublicClient } from "viem";
import { labelhash, namehash, normalizeLabel } from "./namehash";
import { rnsRegistryAbi, rnsResolverAbi, rskOwnerAbi } from "../abi/rns";
import { RNS_ADDRESSES } from "./rnsConfig";

export type DomainRow = {
  label: string;
  name: string;
  node: `0x${string}`;
  resolver: Address | null;
  address: Address | null;
  expiresAt?: number;
  selected: boolean;
};

export async function fetchDomainInfo(
  publicClient: PublicClient,
  label: string
): Promise<DomainRow> {
  const normalized = normalizeLabel(label);
  const name = `${normalized}.rsk`;
  const node = namehash(name);

  let resolver: Address | null = null;
  try {
    resolver = await publicClient.readContract({
      address: RNS_ADDRESSES.registry as Address,
      abi: rnsRegistryAbi,
      functionName: "resolver",
      args: [node]
    });
  } catch (error) {
    resolver = null;
  }

  let address: Address | null = null;
  if (resolver && resolver !== "0x0000000000000000000000000000000000000000") {
    try {
      address = await publicClient.readContract({
        address: resolver,
        abi: rnsResolverAbi,
        functionName: "addr",
        args: [node]
      });
    } catch (error) {
      address = null;
    }
  }

  let expiresAt: number | undefined;
  try {
    const expiry = await publicClient.readContract({
      address: RNS_ADDRESSES.rskOwner as Address,
      abi: rskOwnerAbi,
      functionName: "expirationTime",
      args: [BigInt(labelhash(normalized))]
    });
    expiresAt = Number(expiry);
  } catch (error) {
    expiresAt = undefined;
  }

  return {
    label: normalized,
    name,
    node,
    resolver,
    address,
    expiresAt,
    selected: false
  };
}

export async function fetchDomainsInfo(
  publicClient: PublicClient,
  labels: string[]
): Promise<DomainRow[]> {
  const normalizedLabels = labels.map((label) => normalizeLabel(label)).filter(Boolean);
  if (!normalizedLabels.length) return [];

  const names = normalizedLabels.map((label) => `${label}.rsk`);
  const nodes = names.map((name) => namehash(name));
  const labelHashes = normalizedLabels.map((label) => labelhash(label));

  try {
    const [resolverResults, expiryResults] = await Promise.all([
      publicClient.multicall({
        allowFailure: true,
        contracts: nodes.map((node) => ({
          address: RNS_ADDRESSES.registry as Address,
          abi: rnsRegistryAbi,
          functionName: "resolver",
          args: [node]
        }))
      }),
      publicClient.multicall({
        allowFailure: true,
        contracts: labelHashes.map((hash) => ({
          address: RNS_ADDRESSES.rskOwner as Address,
          abi: rskOwnerAbi,
          functionName: "expirationTime",
          args: [BigInt(hash)]
        }))
      })
    ]);

    const resolvers = resolverResults.map((result) =>
      result.status === "success" ? (result.result as Address) : null
    );
    const expirations = expiryResults.map((result) =>
      result.status === "success" ? (result.result as bigint) : null
    );

    const addrCalls: {
      index: number;
      address: Address;
      node: `0x${string}`;
    }[] = [];

    resolvers.forEach((resolver, index) => {
      if (!resolver || resolver === "0x0000000000000000000000000000000000000000") return;
      addrCalls.push({ index, address: resolver, node: nodes[index] });
    });

    const addrResults = addrCalls.length
      ? await publicClient.multicall({
          allowFailure: true,
          contracts: addrCalls.map((call) => ({
            address: call.address,
            abi: rnsResolverAbi,
            functionName: "addr",
            args: [call.node]
          }))
        })
      : [];

    const resolvedAddrs: Array<Address | null> = Array(nodes.length).fill(null);
    addrResults.forEach((result, idx) => {
      const call = addrCalls[idx];
      if (result.status === "success") {
        resolvedAddrs[call.index] = result.result as Address;
      }
    });

    return normalizedLabels.map((label, index) => ({
      label,
      name: names[index],
      node: nodes[index],
      resolver: resolvers[index],
      address: resolvedAddrs[index],
      expiresAt: expirations[index] ? Number(expirations[index]) : undefined,
      selected: false
    }));
  } catch (error) {
    return Promise.all(normalizedLabels.map((label) => fetchDomainInfo(publicClient, label)));
  }
}
