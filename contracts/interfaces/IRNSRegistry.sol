// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IRNSRegistry {
    function setResolver(bytes32 node, address resolver) external;
}
