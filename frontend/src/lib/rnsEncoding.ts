import { pad, stringToHex, toHex, type Hex } from "viem";

// Encodings mirror the RNS registrar utils (ERC-677 transferAndCall payloads).

const REGISTER_SIGNATURE = "0xc2c414c8";
const ADDR_REGISTER_SIGNATURE = "0x5f7b99d5";
const RENEW_SIGNATURE = "0x14b1a4fc";

function padUint32(value: bigint): string {
  return pad(toHex(value), { size: 32 }).slice(2);
}

function normalizeHex(hex: Hex, size: number): string {
  const stripped = hex.slice(2).toLowerCase();
  return stripped.padStart(size * 2, "0");
}

export function encodeRegisterData(
  name: string,
  owner: `0x${string}`,
  secret: `0x${string}`,
  durationYears: bigint
): Hex {
  const ownerHex = normalizeHex(owner, 20);
  const secretHex = normalizeHex(secret, 32);
  const durationHex = padUint32(durationYears);
  const nameHex = stringToHex(name).slice(2);

  return `${REGISTER_SIGNATURE}${ownerHex}${secretHex}${durationHex}${nameHex}` as Hex;
}

export function encodeAddrRegisterData(
  name: string,
  owner: `0x${string}`,
  secret: `0x${string}`,
  durationYears: bigint,
  addr: `0x${string}`
): Hex {
  const ownerHex = normalizeHex(owner, 20);
  const secretHex = normalizeHex(secret, 32);
  const durationHex = padUint32(durationYears);
  const addrHex = normalizeHex(addr, 20);
  const nameHex = stringToHex(name).slice(2);

  return `${ADDR_REGISTER_SIGNATURE}${ownerHex}${secretHex}${durationHex}${addrHex}${nameHex}` as Hex;
}

export function encodeRenewData(name: string, durationYears: bigint): Hex {
  const durationHex = padUint32(durationYears);
  const nameHex = stringToHex(name).slice(2);

  return `${RENEW_SIGNATURE}${durationHex}${nameHex}` as Hex;
}
