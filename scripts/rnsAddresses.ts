export type RnsAddressConfig = {
  registry: string;
  resolver: string;
  registrar: string;
  renewer: string;
  rifToken: string;
};

export const RNS_ADDRESSES: Record<number, RnsAddressConfig> = {
  31: {
    registry: "0x7d284aaac6e925aad802a53c0c69efe3764597b8",
    resolver: "0x1e7ae43e3503efb886104ace36051ea72b301cdf",
    registrar: "0x36ffda909f941950a552011f2c50569fda14a169",
    renewer: "0xe48ad1d5fbf61394b5a7d81ab2f36736a046657b",
    rifToken: "0x19f64674d8a5b4e652319f5e239efd3bc969a1fe"
  }
};

export function withEnvOverrides(chainId: number): RnsAddressConfig {
  const defaults = RNS_ADDRESSES[chainId];
  if (!defaults) {
    throw new Error(`No RNS address config for chainId ${chainId}`);
  }

  return {
    registry: process.env.RNS_REGISTRY || defaults.registry,
    resolver: process.env.RNS_RESOLVER || defaults.resolver,
    registrar: process.env.RNS_REGISTRAR || defaults.registrar,
    renewer: process.env.RNS_RENEWER || defaults.renewer,
    rifToken: process.env.RIF_TOKEN || defaults.rifToken
  };
}
