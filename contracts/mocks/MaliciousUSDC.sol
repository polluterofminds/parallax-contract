// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MaliciousUSDC is ERC20 {
    uint8 private _decimals = 6;

    constructor() ERC20("Malicious USDC", "mUSDC") {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
    
    // Always fail on transferFrom
    function transferFrom(address, address, uint256) public override returns (bool) {
        return false;
    }
}