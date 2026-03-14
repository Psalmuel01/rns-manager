// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRegistrar} from "./interfaces/IRegistrar.sol";
import {IRNSRegistry} from "./interfaces/IRNSRegistry.sol";
import {IResolver} from "./interfaces/IResolver.sol";

contract RNSBulkManager is Ownable {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    error BatchCallFailed(uint256 index, address target, bytes reason);
    error LengthMismatch();
    error ZeroAddressTarget();
    error ValueMismatch(uint256 expected, uint256 actual);

    event CallFailed(uint256 indexed index, address indexed target, bytes data, bytes reason);
    event TargetsUpdated(address registrar, address renewer, address resolver, address registry);

    address public registrar;
    address public renewer;
    address public resolver;
    address public registry;

    constructor(address _registrar, address _renewer, address _resolver, address _registry) Ownable(msg.sender) {
        registrar = _registrar;
        renewer = _renewer;
        resolver = _resolver;
        registry = _registry;
    }

    function setTargets(address _registrar, address _renewer, address _resolver, address _registry) external onlyOwner {
        registrar = _registrar;
        renewer = _renewer;
        resolver = _resolver;
        registry = _registry;
        emit TargetsUpdated(_registrar, _renewer, _resolver, _registry);
    }

    function multicall(Call[] calldata calls, bool revertOnFail) external payable returns (Result[] memory results) {
        uint256 totalValue;
        results = new Result[](calls.length);

        for (uint256 i = 0; i < calls.length; i++) {
            Call calldata call = calls[i];
            if (call.target == address(0)) revert ZeroAddressTarget();
            totalValue += call.value;
            results[i] = _call(call.target, call.value, call.data, revertOnFail, i);
        }

        if (msg.value < totalValue) revert ValueMismatch(totalValue, msg.value);
        _refundExcess(totalValue);
    }

    function batchCommit(bytes32[] calldata commitments, bool revertOnFail) external returns (Result[] memory results) {
        address target = registrar;
        if (target == address(0)) revert ZeroAddressTarget();

        results = new Result[](commitments.length);
        for (uint256 i = 0; i < commitments.length; i++) {
            bytes memory data = abi.encodeWithSelector(IRegistrar.commit.selector, commitments[i]);
            results[i] = _call(target, 0, data, revertOnFail, i);
        }
    }

    function batchRegister(bytes[] calldata registerData, uint256[] calldata values, bool revertOnFail)
        external
        payable
        returns (Result[] memory results)
    {
        results = _executeFixedTarget(registrar, registerData, values, revertOnFail);
    }

    function batchRenew(bytes[] calldata renewData, uint256[] calldata values, bool revertOnFail)
        external
        payable
        returns (Result[] memory results)
    {
        results = _executeFixedTarget(renewer, renewData, values, revertOnFail);
    }

    function batchSetAddr(bytes32[] calldata nodes, address[] calldata addrs, bool revertOnFail)
        external
        returns (Result[] memory results)
    {
        if (nodes.length != addrs.length) revert LengthMismatch();
        address target = resolver;
        if (target == address(0)) revert ZeroAddressTarget();

        results = new Result[](nodes.length);
        for (uint256 i = 0; i < nodes.length; i++) {
            bytes memory data = abi.encodeWithSelector(IResolver.setAddr.selector, nodes[i], addrs[i]);
            results[i] = _call(target, 0, data, revertOnFail, i);
        }
    }

    function batchSetResolver(bytes32[] calldata nodes, address resolverAddr, bool revertOnFail)
        external
        returns (Result[] memory results)
    {
        address target = registry;
        if (target == address(0)) revert ZeroAddressTarget();

        results = new Result[](nodes.length);
        for (uint256 i = 0; i < nodes.length; i++) {
            bytes memory data = abi.encodeWithSelector(IRNSRegistry.setResolver.selector, nodes[i], resolverAddr);
            results[i] = _call(target, 0, data, revertOnFail, i);
        }
    }

    function _executeFixedTarget(address target, bytes[] calldata data, uint256[] calldata values, bool revertOnFail)
        internal
        returns (Result[] memory results)
    {
        if (target == address(0)) revert ZeroAddressTarget();
        if (data.length != values.length) revert LengthMismatch();

        uint256 totalValue;
        results = new Result[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            totalValue += values[i];
            results[i] = _call(target, values[i], data[i], revertOnFail, i);
        }

        if (msg.value < totalValue) revert ValueMismatch(totalValue, msg.value);
        _refundExcess(totalValue);
    }

    function _call(address target, uint256 value, bytes memory data, bool revertOnFail, uint256 index)
        internal
        returns (Result memory result)
    {
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        if (!success) {
            if (revertOnFail) {
                revert BatchCallFailed(index, target, returnData);
            }
            emit CallFailed(index, target, data, returnData);
        }
        result = Result(success, returnData);
    }

    function _refundExcess(uint256 spent) internal {
        uint256 refund = msg.value - spent;
        if (refund > 0) {
            (bool success, ) = msg.sender.call{value: refund}("");
            require(success, "Refund failed");
        }
    }
}
