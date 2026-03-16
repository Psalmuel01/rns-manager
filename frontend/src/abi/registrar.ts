export const rskRegistrarAbi = [
  {
    type: "function",
    name: "minCommitmentAge",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "makeCommitment",
    stateMutability: "view",
    inputs: [
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "secret", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bytes32" }]
  },
  {
    type: "function",
    name: "price",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "expires", type: "uint256" },
      { name: "duration", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "nameOwner", type: "address" },
      { name: "secret", type: "bytes32" },
      { name: "duration", type: "uint256" }
    ],
    outputs: []
  }
] as const;

export const renewerAbi = [
  {
    type: "function",
    name: "price",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "expires", type: "uint256" },
      { name: "duration", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "renew",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" }
    ],
    outputs: []
  }
] as const;
