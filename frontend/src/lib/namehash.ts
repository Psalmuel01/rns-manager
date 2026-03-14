import { keccak256, toBytes, concat, zeroHash } from "viem";

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\.rsk$/i, "");
}

export function labelhash(label: string): `0x${string}` {
  return keccak256(toBytes(label));
}

export function namehash(name: string): `0x${string}` {
  const parts = name.split(".").filter(Boolean).reverse();
  let node: `0x${string}` = zeroHash;
  for (const part of parts) {
    const label = keccak256(toBytes(part));
    node = keccak256(concat([node, label]));
  }
  return node;
}
