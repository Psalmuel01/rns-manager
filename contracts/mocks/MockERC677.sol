// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC677 is ERC20 {
    event TransferAndCalled(address indexed to, uint256 value, bytes data);

    constructor() ERC20("Mock RIF", "mRIF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool) {
        _transfer(msg.sender, to, value);
        emit TransferAndCalled(to, value, data);
        return true;
    }
}
