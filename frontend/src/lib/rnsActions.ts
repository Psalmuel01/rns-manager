import { Address, PublicClient } from "viem";
import { labelhash, namehash, normalizeLabel } from "./namehash";
import { rnsRegistryAbi, rnsResolverAbi, rskOwnerAbi } from "../abi/rns";
import { RNS_ADDRESSES } from "./rnsConfig";

export type DomainRow = {
  label: string;
  name: string;
  node: `0x${string}`;
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
    address,
    expiresAt,
    selected: false
  };
}
