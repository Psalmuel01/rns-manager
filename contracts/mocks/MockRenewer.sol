// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MockRenewer {
    uint256 public pricePerSecond;
    mapping(bytes32 => uint256) public expirations;

    event Renewed(string label, uint256 duration, uint256 newExpiry);

    constructor(uint256 pricePerSecond_) {
        pricePerSecond = pricePerSecond_;
    }

    function renew(string calldata label, uint256 duration) external payable {
        uint256 price = duration * pricePerSecond;
        require(msg.value >= price, "Insufficient payment");
        bytes32 labelhash = keccak256(bytes(label));
        expirations[labelhash] += duration;
        emit Renewed(label, duration, expirations[labelhash]);
    }
}
