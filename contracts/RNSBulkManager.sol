// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRegistrar} from "./interfaces/IRegistrar.sol";
import {IRNSRegistry} from "./interfaces/IRNSRegistry.sol";
import {IResolver} from "./interfaces/IResolver.sol";

interface IERC677 {
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);
}

/// @title RNSBulkManager
/// @notice Batches supported Rootstock Name Service operations against known contracts.
contract RNSBulkManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    error InvalidTarget(address target);
    error InvalidTokenTarget(address target);
    error InvalidSelector(bytes4 selector);
    error LengthMismatch();
    error RefundFailed();
    error ValueMismatch(uint256 expected, uint256 actual);
    error ZeroAddressTarget();

    event CallFailed(uint256 indexed index, address indexed target, bytes data, bytes reason);
    event TargetsUpdated(address registrar, address renewer, address resolver, address registry, address rifToken);

    address public registrar;
    address public renewer;
    address public resolver;
    address public registry;
    address public rifToken;

    /// @notice Creates the batch manager with the canonical RNS contract addresses.
    constructor(address _registrar, address _renewer, address _resolver, address _registry, address _rifToken)
        Ownable(msg.sender)
    {
        _setTargets(_registrar, _renewer, _resolver, _registry, _rifToken);
    }

    /// @notice Accepts native token transfers so owner rescue can recover accidental funding.
    receive() external payable {}

    /// @notice Updates the target RNS contract addresses.
    function setTargets(address _registrar, address _renewer, address _resolver, address _registry, address _rifToken)
        external
        onlyOwner
    {
        _setTargets(_registrar, _renewer, _resolver, _registry, _rifToken);
    }

    /// @notice Batches RIF `transferAndCall` payments to the registrar or renewer.
    /// @dev This intentionally rejects arbitrary dispatch to avoid turning the contract into a generic operator.
    function multicall(Call[] calldata calls, bool revertOnFail)
        external
        payable
        nonReentrant
        returns (Result[] memory results)
    {
        uint256 totalValue = _validateMulticallAndSum(calls);
        if (msg.value < totalValue) revert ValueMismatch(totalValue, msg.value);

        results = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            Call calldata call = calls[i];
            results[i] = _call(call.target, call.value, call.data, revertOnFail, i);
        }

        _refundExcess(totalValue);
    }

    /// @notice Submits multiple registrar commitments in one transaction.
    function batchCommit(bytes32[] calldata commitments, bool revertOnFail)
        external
        nonReentrant
        returns (Result[] memory results)
    {
        address target = registrar;
        if (target == address(0)) revert ZeroAddressTarget();

        results = new Result[](commitments.length);
        for (uint256 i = 0; i < commitments.length; i++) {
            bytes memory data = abi.encodeWithSelector(IRegistrar.commit.selector, commitments[i]);
            results[i] = _call(target, 0, data, revertOnFail, i);
        }
    }

    /// @notice Executes multiple registrar calls with optional per-call native value.
    function batchRegister(bytes[] calldata registerData, uint256[] calldata values, bool revertOnFail)
        external
        payable
        nonReentrant
        returns (Result[] memory results)
    {
        results = _executeFixedTarget(registrar, registerData, values, revertOnFail);
    }

    /// @notice Executes multiple renewer calls with optional per-call native value.
    function batchRenew(bytes[] calldata renewData, uint256[] calldata values, bool revertOnFail)
        external
        payable
        nonReentrant
        returns (Result[] memory results)
    {
        results = _executeFixedTarget(renewer, renewData, values, revertOnFail);
    }

    /// @notice Executes resolver `setAddr` for multiple nodes.
    function batchSetAddr(bytes32[] calldata nodes, address[] calldata addrs, bool revertOnFail)
        external
        nonReentrant
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

    /// @notice Executes registry `setResolver` for multiple nodes.
    function batchSetResolver(bytes32[] calldata nodes, address resolverAddr, bool revertOnFail)
        external
        nonReentrant
        returns (Result[] memory results)
    {
        address target = registry;
        if (target == address(0) || resolverAddr == address(0)) revert ZeroAddressTarget();

        results = new Result[](nodes.length);
        for (uint256 i = 0; i < nodes.length; i++) {
            bytes memory data = abi.encodeWithSelector(IRNSRegistry.setResolver.selector, nodes[i], resolverAddr);
            results[i] = _call(target, 0, data, revertOnFail, i);
        }
    }

    /// @notice Recovers ERC-20 tokens mistakenly sent to this contract.
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert ZeroAddressTarget();
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Recovers native token balance mistakenly sent to this contract.
    function rescueETH(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddressTarget();
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert RefundFailed();
    }

    function _setTargets(address _registrar, address _renewer, address _resolver, address _registry, address _rifToken)
        internal
    {
        if (
            _registrar == address(0) || _renewer == address(0) || _resolver == address(0) || _registry == address(0)
                || _rifToken == address(0)
        ) revert ZeroAddressTarget();

        registrar = _registrar;
        renewer = _renewer;
        resolver = _resolver;
        registry = _registry;
        rifToken = _rifToken;
        emit TargetsUpdated(_registrar, _renewer, _resolver, _registry, _rifToken);
    }

    function _validateMulticallAndSum(Call[] calldata calls) internal view returns (uint256 totalValue) {
        for (uint256 i = 0; i < calls.length; i++) {
            Call calldata call = calls[i];
            if (call.target == address(0)) revert ZeroAddressTarget();
            if (call.target != rifToken) revert InvalidTarget(call.target);
            if (call.data.length < 4) revert InvalidSelector(bytes4(0));

            bytes4 selector = bytes4(call.data[:4]);
            if (selector != IERC677.transferAndCall.selector) revert InvalidSelector(selector);

            (address tokenTarget,,) = abi.decode(call.data[4:], (address, uint256, bytes));
            if (tokenTarget != registrar && tokenTarget != renewer) {
                revert InvalidTokenTarget(tokenTarget);
            }

            totalValue += call.value;
        }
    }

    function _executeFixedTarget(address target, bytes[] calldata data, uint256[] calldata values, bool revertOnFail)
        internal
        returns (Result[] memory results)
    {
        if (target == address(0)) revert ZeroAddressTarget();
        if (data.length != values.length) revert LengthMismatch();

        uint256 totalValue;
        for (uint256 i = 0; i < values.length; i++) {
            totalValue += values[i];
        }
        if (msg.value < totalValue) revert ValueMismatch(totalValue, msg.value);

        results = new Result[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            results[i] = _call(target, values[i], data[i], revertOnFail, i);
        }

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
            if (!success) revert RefundFailed();
        }
    }
}
