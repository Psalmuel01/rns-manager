# RNS Bulk Manager

A power-user dApp for batch-managing Rootstock Name Service (RNS) domains. It ships:

- `RNSBulkManager` Solidity contract (multicall-style batching)
- Hardhat test suite with realistic mock RNS contracts
- React + wagmi/viem frontend with a table-based bulk management UI

## Workspace

- Contracts + tests live at the repo root
- Frontend lives in `frontend/`

## Quick Start

### Contracts

```bash
npm install
npm run build
npm test
```

### Deploy to Rootstock Testnet

```bash
export PRIVATE_KEY=0xYOUR_PRIVATE_KEY
npm run deploy:testnet
```

Optional overrides (if you want to swap RNS contract addresses):

```bash
export RNS_REGISTRY=0x...
export RNS_RESOLVER=0x...
export RNS_REGISTRAR=0x...
export RNS_RENEWER=0x...
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set your bulk manager address in `frontend/.env`:

```bash
VITE_BULK_MANAGER_ADDRESS=0x...
```

## Testnet Addresses (Rootstock)

From Rootstock/RNS packages and docs:

- Registry: `0x7d284aaac6e925aad802a53c0c69efe3764597b8`
- Resolver: `0x1e7ae43e3503efb886104ace36051ea72b301cdf`
- RSK Owner (ERC-721): `0xca0a477e19bac7e0e172ccfd2e3c28a7200bdb71`
- RIF token: `0x19f64674d8a5b4e652319f5e239efd3bc969a1fe`
- FIFS Addr Registrar: `0x90734bd6bf96250a7b262e2bc34284b0d47c1e8d`
- Partner Registrar: `0x8104d97f6d82a7d3afbf45f72118fad51f190c42`
- RSK Registrar (commit/reveal): `0x36ffda909f941950a552011f2c50569fda14a169`
- Renewer: `0xe48ad1d5fbf61394b5a7d81ab2f36736a046657b`

## Contract Notes

- `RNSBulkManager` is a wrapper: it batches calls to existing RNS contracts. It does not replace them.
- For resolver updates, the user must approve the bulk manager as an operator in the RNS registry.
- `batchRegister`/`batchRenew` accept raw calldata for the registrar/renewer; this keeps the contract
  flexible across RNS implementations.

## Frontend Notes

- The UI loads domain metadata using the registry + resolver + RSK Owner contracts.
- The domain list is input-driven (paste labels). If you want auto-discovery, add an indexer or
  The Graph integration.
- The bulk register panel uses the RSK Registrar token-based flow (ERC-677 `transferAndCall`).
  It encodes the registrar payload as `register(name, nameOwner, secret, duration)` and
  sends RIF tokens to the registrar for payment. Adjust `frontend/src/abi/registrar.ts`
  and `frontend/src/lib/rnsEncoding.ts` if your registrar differs.
- Because the bulk manager is the caller in batch transactions, it must hold enough RIF to
  cover the batch. Transfer RIF to the bulk manager address before registering/renewing.

## Tests

`test/RNSBulkManager.test.ts` covers:

- batch registration flows
- partial failure handling
- resolver updates with registry approvals
- value refund safety
