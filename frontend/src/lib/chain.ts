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
  }
});
