import "dotenv/config";
import hardhatEthersPlugin from "@nomicfoundation/hardhat-ethers";
import { defineConfig } from "hardhat/config";


export default defineConfig({
  plugins: [hardhatEthersPlugin],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    rskTestnet: {
      type: "http",
      chainType: "l1",
      url: process.env.RSK_TESTNET_RPC || "https://public-node.testnet.rsk.co",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  }
});
