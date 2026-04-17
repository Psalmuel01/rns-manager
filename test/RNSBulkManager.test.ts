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
    const [deployer, user, stranger] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("MockRegistry");
    const registry = await Registry.deploy();

    const Resolver = await ethers.getContractFactory("MockResolver");
    const resolver = await Resolver.deploy(await registry.getAddress());

    const Registrar = await ethers.getContractFactory("MockRegistrar");
    const registrar = await Registrar.deploy(await registry.getAddress(), 1n);

    const Renewer = await ethers.getContractFactory("MockRenewer");
    const renewer = await Renewer.deploy(1n);

    const Token = await ethers.getContractFactory("MockERC677");
    const rifToken = await Token.deploy();

    const Bulk = await ethers.getContractFactory("RNSBulkManager");
    const bulkManager = await Bulk.deploy(
      await registrar.getAddress(),
      await renewer.getAddress(),
      await resolver.getAddress(),
      await registry.getAddress(),
      await rifToken.getAddress()
    );

    return { deployer, user, stranger, registry, resolver, registrar, renewer, rifToken, bulkManager };
  }

  it("rejects zero addresses in the constructor", async function () {
    const Registry = await ethers.getContractFactory("MockRegistry");
    const registry = await Registry.deploy();

    const Resolver = await ethers.getContractFactory("MockResolver");
    const resolver = await Resolver.deploy(await registry.getAddress());

    const Registrar = await ethers.getContractFactory("MockRegistrar");
    const registrar = await Registrar.deploy(await registry.getAddress(), 1n);

    const Renewer = await ethers.getContractFactory("MockRenewer");
    const renewer = await Renewer.deploy(1n);

    const Bulk = await ethers.getContractFactory("RNSBulkManager");

    await expect(
      Bulk.deploy(
        await registrar.getAddress(),
        await renewer.getAddress(),
        await resolver.getAddress(),
        await registry.getAddress(),
        ethers.ZeroAddress
      )
    ).to.be.revertedWithCustomError(Bulk, "ZeroAddressTarget");
  });

  it("only lets the owner update targets and rejects zero addresses", async function () {
    const { bulkManager, registrar, renewer, resolver, registry, rifToken, user } = await deployFixture();

    await expect(
      bulkManager
        .connect(user)
        .setTargets(
          await registrar.getAddress(),
          await renewer.getAddress(),
          await resolver.getAddress(),
          await registry.getAddress(),
          await rifToken.getAddress()
        )
    )
      .to.be.revertedWithCustomError(bulkManager, "OwnableUnauthorizedAccount")
      .withArgs(user.address);

    await expect(
      bulkManager.setTargets(
        await registrar.getAddress(),
        await renewer.getAddress(),
        await resolver.getAddress(),
        await registry.getAddress(),
        ethers.ZeroAddress
      )
    ).to.be.revertedWithCustomError(bulkManager, "ZeroAddressTarget");
  });

  it("batchCommit stores every commitment", async function () {
    const { bulkManager, registrar } = await deployFixture();

    const commitments = [ethers.keccak256(ethers.toUtf8Bytes("alpha")), ethers.keccak256(ethers.toUtf8Bytes("beta"))];

    await bulkManager.batchCommit(commitments, true);

    expect(await registrar.commitments(commitments[0])).to.equal(true);
    expect(await registrar.commitments(commitments[1])).to.equal(true);
  });

  it("batchRegister registers multiple labels", async function () {
    const { bulkManager, registrar, registry, user } = await deployFixture();

    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);
    const registerBob = registrar.interface.encodeFunctionData("register", ["bob", user.address, ONE_YEAR]);
    const value = ONE_YEAR;

    await bulkManager.batchRegister([registerAlice, registerBob], [value, value], true, { value: value * 2n });

    expect(await registry.owner(labelToNode("alice"))).to.equal(user.address);
    expect(await registry.owner(labelToNode("bob"))).to.equal(user.address);
  });

  it("batchRenew renews multiple labels", async function () {
    const { bulkManager, renewer } = await deployFixture();

    const renewAlpha = renewer.interface.encodeFunctionData("renew", ["alpha", ONE_YEAR]);
    const renewBeta = renewer.interface.encodeFunctionData("renew", ["beta", ONE_YEAR / 2n]);

    await bulkManager.batchRenew([renewAlpha, renewBeta], [ONE_YEAR, ONE_YEAR / 2n], true, {
      value: ONE_YEAR + ONE_YEAR / 2n
    });

    expect(await renewer.expirations(ethers.keccak256(ethers.toUtf8Bytes("alpha")))).to.equal(ONE_YEAR);
    expect(await renewer.expirations(ethers.keccak256(ethers.toUtf8Bytes("beta")))).to.equal(ONE_YEAR / 2n);
  });

  it("batchSetResolver updates registry resolver when the owner approved the manager", async function () {
    const { bulkManager, registry, resolver, user } = await deployFixture();
    const node = labelToNode("sammy");

    await registry.setOwner(node, user.address);
    await registry.connect(user).setApprovalForAll(await bulkManager.getAddress(), true);

    await bulkManager.batchSetResolver([node], await resolver.getAddress(), true);

    expect(await registry.resolver(node)).to.equal(await resolver.getAddress());
  });

  it("batchSetAddr updates resolver records when the owner approved the manager", async function () {
    const { bulkManager, registry, resolver, user } = await deployFixture();
    const node = labelToNode("sammy");
    const targetAddress = "0x000000000000000000000000000000000000dEaD";

    await registry.setOwner(node, user.address);
    await registry.connect(user).setResolver(node, await resolver.getAddress());
    await registry.connect(user).setApprovalForAll(await bulkManager.getAddress(), true);

    await bulkManager.batchSetAddr([node], [targetAddress], true);

    expect(await resolver.addr(node)).to.equal(targetAddress);
  });

  it("rejects mismatched array lengths", async function () {
    const { bulkManager, renewer } = await deployFixture();
    const renewCall = renewer.interface.encodeFunctionData("renew", ["alpha", ONE_YEAR]);

    await expect(bulkManager.batchRegister([], [1n], true)).to.be.revertedWithCustomError(
      bulkManager,
      "LengthMismatch"
    );
    await expect(bulkManager.batchRenew([renewCall], [], true)).to.be.revertedWithCustomError(
      bulkManager,
      "LengthMismatch"
    );
    await expect(
      bulkManager.batchSetAddr([labelToNode("alpha")], [ethers.ZeroAddress, ethers.ZeroAddress], true)
    ).to.be.revertedWithCustomError(bulkManager, "LengthMismatch");
  });

  it("checks value sufficiency before executing register calls", async function () {
    const { bulkManager, registrar, registry, user } = await deployFixture();
    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);

    await expect(bulkManager.batchRegister([registerAlice], [ONE_YEAR], false, { value: ONE_YEAR - 1n }))
      .to.be.revertedWithCustomError(bulkManager, "ValueMismatch")
      .withArgs(ONE_YEAR, ONE_YEAR - 1n);

    expect(await registry.owner(labelToNode("alice"))).to.equal(ethers.ZeroAddress);
  });

  it("restricts multicall to RIF transferAndCall into the registrar or renewer", async function () {
    const { bulkManager, rifToken, registrar, renewer, user } = await deployFixture();

    const invalidTransferAndCall = rifToken.interface.encodeFunctionData("transferAndCall", [
      user.address,
      10n,
      "0x1234"
    ]);
    const approveCall = rifToken.interface.encodeFunctionData("approve", [user.address, 10n]);
    const renewTransfer = rifToken.interface.encodeFunctionData("transferAndCall", [
      await renewer.getAddress(),
      20n,
      "0xabcd"
    ]);

    await rifToken.mint(await bulkManager.getAddress(), 50n);

    await expect(
      bulkManager.multicall([{ target: ethers.ZeroAddress, value: 0n, data: "0x" }], false)
    ).to.be.revertedWithCustomError(bulkManager, "ZeroAddressTarget");

    await expect(
      bulkManager.multicall([{ target: await registrar.getAddress(), value: 0n, data: "0x12345678" }], false)
    )
      .to.be.revertedWithCustomError(bulkManager, "InvalidTarget")
      .withArgs(await registrar.getAddress());

    await expect(
      bulkManager.multicall([{ target: await rifToken.getAddress(), value: 0n, data: approveCall }], false)
    )
      .to.be.revertedWithCustomError(bulkManager, "InvalidSelector")
      .withArgs(approveCall.slice(0, 10));

    await expect(
      bulkManager.multicall(
        [{ target: await rifToken.getAddress(), value: 0n, data: invalidTransferAndCall }],
        false
      )
    )
      .to.be.revertedWithCustomError(bulkManager, "InvalidTokenTarget")
      .withArgs(user.address);

    await expect(
      bulkManager.multicall([{ target: await rifToken.getAddress(), value: 0n, data: renewTransfer }], false)
    )
      .to.emit(rifToken, "TransferAndCalled")
      .withArgs(await renewer.getAddress(), 20n, "0xabcd");
  });

  it("emits failures without reverting when revertOnFail is false", async function () {
    const { bulkManager, resolver } = await deployFixture();
    const node = labelToNode("no-owner");

    const results = await bulkManager.batchSetAddr.staticCall(
      [node],
      ["0x000000000000000000000000000000000000dEaD"],
      false
    );

    expect(results[0].success).to.equal(false);

    await expect(
      bulkManager.batchSetAddr([node], ["0x000000000000000000000000000000000000dEaD"], false)
    )
      .to.emit(bulkManager, "CallFailed")
      .withArgs(0, await resolver.getAddress(), anyValue, anyValue);
  });

  it("refunds excess ETH and exposes rescue functions to the owner", async function () {
    const { bulkManager, registrar, rifToken, deployer, user } = await deployFixture();
    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);

    await rifToken.mint(await bulkManager.getAddress(), 100n);

    await expect(
      bulkManager.connect(user).rescueTokens(await rifToken.getAddress(), user.address, 1n)
    )
      .to.be.revertedWithCustomError(bulkManager, "OwnableUnauthorizedAccount")
      .withArgs(user.address);

    await bulkManager.batchRegister([registerAlice], [ONE_YEAR], true, { value: ONE_YEAR + 1000n });
    expect(await ethers.provider.getBalance(await bulkManager.getAddress())).to.equal(0n);

    await deployer.sendTransaction({ to: await bulkManager.getAddress(), value: 5_000n });
    await bulkManager.rescueETH(deployer.address, 5_000n);
    expect(await ethers.provider.getBalance(await bulkManager.getAddress())).to.equal(0n);

    await bulkManager.rescueTokens(await rifToken.getAddress(), deployer.address, 100n);
    expect(await rifToken.balanceOf(deployer.address)).to.equal(100n);
  });
});
