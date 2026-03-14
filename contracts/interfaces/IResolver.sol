// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IResolver {
    function setAddr(bytes32 node, address addr) external;
}
