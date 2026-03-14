export const bulkManagerAbi = [
  {
    type: "function",
    name: "batchCommit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitments", type: "bytes32[]" },
      { name: "revertOnFail", type: "bool" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "batchRegister",
    stateMutability: "payable",
    inputs: [
      { name: "registerData", type: "bytes[]" },
      { name: "values", type: "uint256[]" },
      { name: "revertOnFail", type: "bool" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "batchRenew",
    stateMutability: "payable",
    inputs: [
      { name: "renewData", type: "bytes[]" },
      { name: "values", type: "uint256[]" },
      { name: "revertOnFail", type: "bool" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "batchSetAddr",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nodes", type: "bytes32[]" },
      { name: "addrs", type: "address[]" },
      { name: "revertOnFail", type: "bool" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" }
        ]
      }
    ]
  }
] as const;
