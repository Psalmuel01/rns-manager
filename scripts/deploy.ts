import { ethers } from "hardhat";
import { withEnvOverrides } from "./rnsAddresses";

async function main() {
  const network = await ethers.provider.getNetwork();
  const addresses = withEnvOverrides(Number(network.chainId));

  const Bulk = await ethers.getContractFactory("RNSBulkManager");
  const bulk = await Bulk.deploy(addresses.registrar, addresses.renewer, addresses.resolver, addresses.registry);
  await bulk.waitForDeployment();

  const bulkAddress = await bulk.getAddress();
  console.log(`RNSBulkManager deployed to: ${bulkAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
