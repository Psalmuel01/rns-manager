// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockRegistry} from "./MockRegistry.sol";

contract MockRegistrar {
    MockRegistry public registry;
    uint256 public pricePerSecond;
    mapping(bytes32 => bool) public commitments;

    event Committed(bytes32 commitment);
    event Registered(string label, address owner, uint256 duration, bytes32 node);

    constructor(address registryAddress, uint256 pricePerSecond_) {
        registry = MockRegistry(registryAddress);
        pricePerSecond = pricePerSecond_;
    }

    function commit(bytes32 commitment) external {
        commitments[commitment] = true;
        emit Committed(commitment);
    }

    function register(string calldata label, address owner, uint256 duration) external payable {
        uint256 price = duration * pricePerSecond;
        require(msg.value >= price, "Insufficient payment");
        bytes32 labelhash = keccak256(bytes(label));
        bytes32 node = keccak256(abi.encodePacked(bytes32(0), labelhash));
        registry.setOwner(node, owner);
        emit Registered(label, owner, duration, node);
    }
}
