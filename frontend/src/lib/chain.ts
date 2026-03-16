import { defineChain } from "viem";

export const rootstockTestnet = defineChain({
  id: 31,
  name: "Rootstock Testnet",
  nativeCurrency: {
    name: "tRBTC",
    symbol: "tRBTC",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://public-node.testnet.rsk.co"]
    }
  },
  blockExplorers: {
    default: {
      name: "Rootstock Explorer",
      url: "https://explorer.testnet.rsk.co"
    }
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 2771150
    }
  }
});
