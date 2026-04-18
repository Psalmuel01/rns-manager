import { expect } from "chai";
import { BaseContract, ContractTransactionReceipt, ethers } from "ethers";
import hre from "hardhat";

const { network } = hre;
const ONE_YEAR = 31_536_000n;

function labelToNode(label: string): string {
  const labelhash = ethers.keccak256(ethers.toUtf8Bytes(label));
  return ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [ethers.ZeroHash, labelhash]));
}

async function expectCustomError(
  action: Promise<unknown>,
  expectedName: string,
  expectedArgs?: Array<string | bigint>
) {
  try {
    await action;
    expect.fail(`Expected custom error ${expectedName}`);
  } catch (error) {
    const revert = extractRevert(error);
    if (revert?.name) {
      expect(revert.name).to.equal(expectedName);
      if (expectedArgs) {
        expect(normalizeArgs(revert.args ?? [])).to.deep.equal(expectedArgs.map((value) => String(value)));
      }
      return;
    }

    const message = String((error as { message?: string })?.message ?? error);
    expect(message).to.include(expectedName);
    for (const value of expectedArgs ?? []) {
      expect(message).to.include(String(value));
    }
  }
}

function extractRevert(error: unknown): { name?: string; args?: unknown[] } | undefined {
  if (!error || typeof error !== "object") return undefined;

  const candidate = error as {
    revert?: { name?: string; args?: unknown[] };
    error?: unknown;
    data?: unknown;
    info?: unknown;
  };

  return (
    candidate.revert ||
    extractRevert(candidate.error) ||
    extractRevert(candidate.data) ||
    extractRevert(candidate.info)
  );
}

function normalizeArgs(args: unknown[]) {
  return args.map((value) => String(value));
}

async function findEventArgs(
  contract: BaseContract,
  receipt: ContractTransactionReceipt,
  eventName: string
) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) {
        return parsed.args;
      }
    } catch {
      // ignore logs from other contracts
    }
  }

  return null;
}

describe("RNSBulkManager", function () {
  async function deployFixture() {
    const [deployer, user, stranger] = await hre.ethers.getSigners();

    const Registry = await hre.ethers.getContractFactory("MockRegistry");
    const registry = await Registry.deploy();

    const Resolver = await hre.ethers.getContractFactory("MockResolver");
    const resolver = await Resolver.deploy(await registry.getAddress());

    const Registrar = await hre.ethers.getContractFactory("MockRegistrar");
    const registrar = await Registrar.deploy(await registry.getAddress(), 1n);

    const Renewer = await hre.ethers.getContractFactory("MockRenewer");
    const renewer = await Renewer.deploy(1n);

    const Token = await hre.ethers.getContractFactory("MockERC677");
    const rifToken = await Token.deploy();

    const Bulk = await hre.ethers.getContractFactory("RNSBulkManager");
    const bulkManager = await Bulk.deploy(
      await registrar.getAddress(),
      await renewer.getAddress(),
      await resolver.getAddress(),
      await registry.getAddress(),
      await rifToken.getAddress()
    );

    return { deployer, user, stranger, registry, resolver, registrar, renewer, rifToken, bulkManager, Bulk };
  }

  it("rejects zero addresses in the constructor", async function () {
    const Registry = await hre.ethers.getContractFactory("MockRegistry");
    const registry = await Registry.deploy();

    const Resolver = await hre.ethers.getContractFactory("MockResolver");
    const resolver = await Resolver.deploy(await registry.getAddress());

    const Registrar = await hre.ethers.getContractFactory("MockRegistrar");
    const registrar = await Registrar.deploy(await registry.getAddress(), 1n);

    const Renewer = await hre.ethers.getContractFactory("MockRenewer");
    const renewer = await Renewer.deploy(1n);

    const Bulk = await hre.ethers.getContractFactory("RNSBulkManager");

    await expectCustomError(
      Bulk.deploy(
        await registrar.getAddress(),
        await renewer.getAddress(),
        await resolver.getAddress(),
        await registry.getAddress(),
        ethers.ZeroAddress
      ),
      "ZeroAddressTarget"
    );
  });

  it("only lets the owner update targets and rejects zero addresses", async function () {
    const { bulkManager, registrar, renewer, resolver, registry, rifToken, user } = await deployFixture();

    await expectCustomError(
      bulkManager
        .connect(user)
        .setTargets(
          await registrar.getAddress(),
          await renewer.getAddress(),
          await resolver.getAddress(),
          await registry.getAddress(),
          await rifToken.getAddress()
        ),
      "OwnableUnauthorizedAccount",
      [user.address]
    );

    await expectCustomError(
      bulkManager.setTargets(
        await registrar.getAddress(),
        await renewer.getAddress(),
        await resolver.getAddress(),
        await registry.getAddress(),
        ethers.ZeroAddress
      ),
      "ZeroAddressTarget"
    );
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

    await expectCustomError(bulkManager.batchRegister([], [1n], true), "LengthMismatch");
    await expectCustomError(bulkManager.batchRenew([renewCall], [], true), "LengthMismatch");
    await expectCustomError(
      bulkManager.batchSetAddr([labelToNode("alpha")], [ethers.ZeroAddress, ethers.ZeroAddress], true),
      "LengthMismatch"
    );
  });

  it("checks value sufficiency before executing register calls", async function () {
    const { bulkManager, registrar, registry, user } = await deployFixture();
    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);

    await expectCustomError(
      bulkManager.batchRegister([registerAlice], [ONE_YEAR], false, { value: ONE_YEAR - 1n }),
      "ValueMismatch",
      [ONE_YEAR, ONE_YEAR - 1n]
    );

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

    await expectCustomError(
      bulkManager.multicall([{ target: ethers.ZeroAddress, value: 0n, data: "0x" }], false),
      "ZeroAddressTarget"
    );

    await expectCustomError(
      bulkManager.multicall([{ target: await registrar.getAddress(), value: 0n, data: "0x12345678" }], false),
      "InvalidTarget",
      [await registrar.getAddress()]
    );

    await expectCustomError(
      bulkManager.multicall([{ target: await rifToken.getAddress(), value: 0n, data: approveCall }], false),
      "InvalidSelector"
    );

    await expectCustomError(
      bulkManager.multicall(
        [{ target: await rifToken.getAddress(), value: 0n, data: invalidTransferAndCall }],
        false
      ),
      "InvalidTokenTarget",
      [user.address]
    );

    const tx = await bulkManager.multicall(
      [{ target: await rifToken.getAddress(), value: 0n, data: renewTransfer }],
      false
    );
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    const args = await findEventArgs(rifToken, receipt, "TransferAndCalled");
    expect(args).to.not.equal(null);
    expect(String(args?.[0])).to.equal(await renewer.getAddress());
    expect(args?.[1]).to.equal(20n);
    expect(args?.[2]).to.equal("0xabcd");
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

    const tx = await bulkManager.batchSetAddr([node], ["0x000000000000000000000000000000000000dEaD"], false);
    const receipt = (await tx.wait()) as ContractTransactionReceipt;
    const args = await findEventArgs(bulkManager, receipt, "CallFailed");
    expect(args).to.not.equal(null);
    expect(args?.[0]).to.equal(0n);
    expect(String(args?.[1])).to.equal(await resolver.getAddress());
  });

  it("refunds excess ETH and exposes rescue functions to the owner", async function () {
    const { bulkManager, registrar, rifToken, deployer, user } = await deployFixture();
    const registerAlice = registrar.interface.encodeFunctionData("register", ["alice", user.address, ONE_YEAR]);

    await rifToken.mint(await bulkManager.getAddress(), 100n);

    await expectCustomError(
      bulkManager.connect(user).rescueTokens(await rifToken.getAddress(), user.address, 1n),
      "OwnableUnauthorizedAccount",
      [user.address]
    );

    await bulkManager.batchRegister([registerAlice], [ONE_YEAR], true, { value: ONE_YEAR + 1000n });
    expect(await network.provider.send("eth_getBalance", [await bulkManager.getAddress(), "latest"])).to.equal(
      ethers.toQuantity(0n)
    );

    await deployer.sendTransaction({ to: await bulkManager.getAddress(), value: 5_000n });
    await bulkManager.rescueETH(deployer.address, 5_000n);
    expect(await network.provider.send("eth_getBalance", [await bulkManager.getAddress(), "latest"])).to.equal(
      ethers.toQuantity(0n)
    );

    await bulkManager.rescueTokens(await rifToken.getAddress(), deployer.address, 100n);
    expect(await rifToken.balanceOf(deployer.address)).to.equal(100n);
  });
});
