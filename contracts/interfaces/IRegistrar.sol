// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IRegistrar {
    function commit(bytes32 commitment) external;
}
