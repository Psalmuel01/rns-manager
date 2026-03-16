import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const ONE_YEAR = 31_536_000n;

function labelToNode(label: string): string {
  const labelhash = ethers.keccak256(ethers.toUtf8Bytes(label));
  return ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [ethers.ZeroHash, labelhash]));
}

describe("RNSBulkManager", function () {
  async function deployFixture() {
    const [deployer, user] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("MockRegistry");
    const registry = await Registry.deploy();

    const Resolver = await ethers.getContractFactory("MockResolver");
    const resolver = await Resolver.deploy(await registry.getAddress());

    const Registrar = await ethers.getContractFactory("MockRegistrar");
    const registrar = await Registrar.deploy(await registry.getAddress(), 1n);

    const Renewer = await ethers.getContractFactory("MockRenewer");
    const renewer = await Renewer.deploy(1n);

    const Bulk = await ethers.getContractFactory("RNSBulkManager");
    const bulkManager = await Bulk.deploy(
      await registrar.getAddress(),
      await renewer.getAddress(),
      await resolver.getAddress(),
      await registry.getAddress()
    );

    return { deployer, user, registry, resolver, registrar, renewer, bulkManager };
  }

  it("batchRegister registers multiple names", async function () {
    const { bulkManager, registrar, registry, user } = await deployFixture();

    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);
    const registerBob = registrar.interface.encodeFunctionData("register", ["bob", user.address, ONE_YEAR]);
    const value = 1n * ONE_YEAR;

    await bulkManager.batchRegister([registerAlice, registerBob], [value, value], true, { value: value * 2n });

    const aliceNode = labelToNode("alice");
    const bobNode = labelToNode("bob");

    expect(await registry.owner(aliceNode)).to.equal(user.address);
    expect(await registry.owner(bobNode)).to.equal(user.address);
  });

  it("batchRegister can continue on failures when revertOnFail=false", async function () {
    const { bulkManager, registrar } = await deployFixture();

    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", registrar.target, ONE_YEAR]);
    const registerBob = registrar.interface.encodeFunctionData("register", ["bob", registrar.target, ONE_YEAR]);
    const value = 1n * ONE_YEAR;

    const results = await bulkManager.batchRegister.staticCall(
      [registerAlice, registerBob],
      [value, 0n],
      false,
      { value }
    );

    expect(results[0].success).to.equal(true);
    expect(results[1].success).to.equal(false);

    await expect(bulkManager.batchRegister([registerAlice, registerBob], [value, 0n], false, { value }))
      .to.emit(bulkManager, "CallFailed")
      .withArgs(1, registrar.target, registerBob, anyValue);
  });

  it("batchSetAddr respects registry approvals", async function () {
    const { bulkManager, registrar, registry, resolver, user } = await deployFixture();

    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);
    const value = 1n * ONE_YEAR;
    await bulkManager.batchRegister([registerAlice], [value], true, { value });

    const aliceNode = labelToNode("alice");
    const targetAddress = "0x000000000000000000000000000000000000dEaD";

    const failedResults = await bulkManager.batchSetAddr.staticCall([aliceNode], [targetAddress], false);
    expect(failedResults[0].success).to.equal(false);

    await registry.connect(user).setApprovalForAll(await bulkManager.getAddress(), true);

    const successResults = await bulkManager.batchSetAddr.staticCall([aliceNode], [targetAddress], true);
    expect(successResults[0].success).to.equal(true);

    await bulkManager.batchSetAddr([aliceNode], [targetAddress], true);
    expect(await resolver.addr(aliceNode)).to.equal(targetAddress);
  });

  it("multicall refunds unused value", async function () {
    const { bulkManager, registrar } = await deployFixture();
    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", registrar.target, ONE_YEAR]);
    const value = 1n * ONE_YEAR;

    const before = await ethers.provider.getBalance(bulkManager.target);
    expect(before).to.equal(0n);

    await bulkManager.batchRegister([registerAlice], [value], true, { value: value + 1000n });

    const after = await ethers.provider.getBalance(bulkManager.target);
    expect(after).to.equal(0n);
  });
});
