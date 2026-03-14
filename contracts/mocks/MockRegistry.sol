// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockRegistry {
    mapping(bytes32 => address) private owners;
    mapping(bytes32 => address) private resolvers;
    mapping(address => mapping(address => bool)) private operatorApprovals;

    event OwnerChanged(bytes32 indexed node, address owner);
    event ResolverChanged(bytes32 indexed node, address resolver);

    function owner(bytes32 node) external view returns (address) {
        return owners[node];
    }

    function resolver(bytes32 node) external view returns (address) {
        return resolvers[node];
    }

    function setOwner(bytes32 node, address newOwner) external {
        owners[node] = newOwner;
        emit OwnerChanged(node, newOwner);
    }

    function setResolver(bytes32 node, address resolverAddress) external {
        require(_isAuthorised(node), "Not authorised");
        resolvers[node] = resolverAddress;
        emit ResolverChanged(node, resolverAddress);
    }

    function setApprovalForAll(address operator, bool approved) external {
        operatorApprovals[msg.sender][operator] = approved;
    }

    function isApprovedForAll(address ownerAddress, address operator) external view returns (bool) {
        return operatorApprovals[ownerAddress][operator];
    }

    function _isAuthorised(bytes32 node) internal view returns (bool) {
        address nodeOwner = owners[node];
        return nodeOwner == msg.sender || operatorApprovals[nodeOwner][msg.sender];
    }
}
