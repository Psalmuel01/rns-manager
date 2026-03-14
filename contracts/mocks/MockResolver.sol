// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockRegistry} from "./MockRegistry.sol";

contract MockResolver {
    MockRegistry public registry;
    mapping(bytes32 => address) private addrs;

    event AddrChanged(bytes32 indexed node, address addr);

    constructor(address registryAddress) {
        registry = MockRegistry(registryAddress);
    }

    function addr(bytes32 node) external view returns (address) {
        return addrs[node];
    }

    function setAddr(bytes32 node, address addr_) external {
        require(_isAuthorised(node), "Not authorised");
        addrs[node] = addr_;
        emit AddrChanged(node, addr_);
    }

    function _isAuthorised(bytes32 node) internal view returns (bool) {
        address nodeOwner = registry.owner(node);
        return nodeOwner == msg.sender || registry.isApprovedForAll(nodeOwner, msg.sender);
    }
}
