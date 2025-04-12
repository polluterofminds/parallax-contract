// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GameEscrow
 * @dev A contract that escrows USDC for a game played in cases
 * Each case is initialized with an IPFS CID containing crime information
 * Players deposit 10 USDC to participate in a case
 * A case requires 10 players to become active
 * At the end of each case, a winner receives 90% of the pot
 * 10% goes to the contract owner
 */
contract Parallax is Ownable, ReentrancyGuard {
    // USDC token interface
    IERC20 public usdcToken;

    // Required deposit amount (10 USDC with 6 decimals)
    uint256 public constant ENTRY_FEE = 10 * 10 ** 6; // 10 USDC (USDC has 6 decimals)

    // Commission rate for the owner (10%)
    uint256 public constant COMMISSION_PERCENTAGE = 10;

    // Required number of players to activate a case
    uint256 public constant REQUIRED_PLAYERS = 10;

    // Case status enum
    enum CaseStatus {
        Pending,
        Active,
        Completed
    }

    // Current case number
    uint256 public currentCase = 1;

    // Track players who have deposited in the current case
    mapping(address => bool) public hasPlayerDeposited;

    // Array to keep track of all players in the current case
    address[] public casePlayers;

    // Track winners of each case
    mapping(uint256 => address) public caseWinners;

    // Track prize amount for each case
    mapping(uint256 => uint256) public casePrizes;

    // Track status of each case
    mapping(uint256 => CaseStatus) public caseStatus;

    // Track IPFS CIDs for each case's crime information
    mapping(uint256 => string) public caseCrimeInfoCID;

    // Events
    event PlayerDeposited(address player, uint256 amount, uint256 case_);
    event CaseStatusChanged(uint256 case_, CaseStatus status);
    event CaseEnded(uint256 case_, address winner, uint256 prize);
    event NewCaseStarted(uint256 case_, string crimeInfoCID);
    event CaseCrimeInfoUpdated(uint256 case_, string crimeInfoCID);
    event CaseCancelled(uint256 case_);
    event PlayerWithdrawn(address player, uint256 amount, uint256 case_);
    event PlayerRefunded(address player, uint256 amount, uint256 case_);

    /**
     * @dev Constructor sets the USDC token address and initializes the contract
     * @param _usdcToken Address of the USDC token contract
     */
    constructor(address _usdcToken) Ownable(msg.sender) {
        require(_usdcToken != address(0), "Invalid USDC token address");
        usdcToken = IERC20(_usdcToken);
        caseStatus[currentCase] = CaseStatus.Pending;
        // First case starts without crime info, it needs to be set separately
    }

    /**
     * @dev Set the IPFS CID for the current case's crime information
     * @param crimeInfoCID IPFS CID containing crime information
     */
    function setCaseCrimeInfo(string calldata crimeInfoCID) external onlyOwner {
        require(
            caseStatus[currentCase] == CaseStatus.Pending,
            "Can only set crime info for pending cases"
        );
        require(
            bytes(crimeInfoCID).length > 0,
            "Crime info CID cannot be empty"
        );

        // If this is the first time setting crime info for this case, emit NewCaseStarted
        if (bytes(caseCrimeInfoCID[currentCase]).length == 0) {
            caseCrimeInfoCID[currentCase] = crimeInfoCID;
            emit NewCaseStarted(currentCase, crimeInfoCID);
        } else {
            // Otherwise, it's an update to existing crime info
            caseCrimeInfoCID[currentCase] = crimeInfoCID;
            emit CaseCrimeInfoUpdated(currentCase, crimeInfoCID);
        }
    }

    /**
     * @dev Allow player to deposit USDC to participate in the current case
     */
    function depositToPlay() external nonReentrant {
        require(
            caseStatus[currentCase] != CaseStatus.Completed,
            "Current case is completed"
        );
        require(
            !hasPlayerDeposited[msg.sender],
            "Player has already deposited for this case"
        );
        require(
            bytes(caseCrimeInfoCID[currentCase]).length > 0,
            "Case has no crime info yet"
        );

        // Transfer USDC from player to this contract
        bool success = usdcToken.transferFrom(
            msg.sender,
            address(this),
            ENTRY_FEE
        );
        require(success, "USDC transfer failed");

        // Mark player as deposited and add to players array
        hasPlayerDeposited[msg.sender] = true;
        casePlayers.push(msg.sender);

        emit PlayerDeposited(msg.sender, ENTRY_FEE, currentCase);

        // Check if we've reached the required number of players
        if (
            casePlayers.length >= REQUIRED_PLAYERS &&
            caseStatus[currentCase] == CaseStatus.Pending
        ) {
            caseStatus[currentCase] = CaseStatus.Active;
            emit CaseStatusChanged(currentCase, CaseStatus.Active);
        }
    }

    /**
     * @dev End the current case, declare a winner, distribute prizes and start a new case
     * @param winner Address of the winning player
     */
    function gameOver(address winner) external onlyOwner nonReentrant {
        require(casePlayers.length > 0, "No players in this case");
        require(
            casePlayers.length >= REQUIRED_PLAYERS,
            "Not enough players to end case"
        );
        require(
            caseStatus[currentCase] == CaseStatus.Active,
            "Case is not active"
        );
        require(
            hasPlayerDeposited[winner],
            "Winner is not a participating player"
        );

        // Calculate total prize and commission
        uint256 totalPrize = casePlayers.length * ENTRY_FEE;
        uint256 commission = (totalPrize * COMMISSION_PERCENTAGE) / 100;
        uint256 winnerPrize = totalPrize - commission;

        // Record the winner and prize for this case
        caseWinners[currentCase] = winner;
        casePrizes[currentCase] = winnerPrize;
        caseStatus[currentCase] = CaseStatus.Completed;

        // Transfer funds
        bool success1 = usdcToken.transfer(owner(), commission);
        bool success2 = usdcToken.transfer(winner, winnerPrize);
        require(success1 && success2, "Prize distribution failed");

        emit CaseStatusChanged(currentCase, CaseStatus.Completed);
        emit CaseEnded(currentCase, winner, winnerPrize);

        // Start new case
        currentCase++;
        caseStatus[currentCase] = CaseStatus.Pending;

        // Reset player tracking for the new case
        for (uint i = 0; i < casePlayers.length; i++) {
            hasPlayerDeposited[casePlayers[i]] = false;
        }

        // Clear the players array
        delete casePlayers;

        // Note: Crime info for the new case must be set separately
    }

    /**
     * @dev Get the IPFS CID for a case's crime information
     * @param case_ Case number
     * @return Crime information IPFS CID
     */
    function getCaseCrimeInfoCID(
        uint256 case_
    ) external view returns (string memory) {
        return caseCrimeInfoCID[case_];
    }

    /**
     * @dev Get the current status of the case
     * @return Current case status (Pending, Active, or Completed)
     */
    function getCurrentCaseStatus() external view returns (CaseStatus) {
        return caseStatus[currentCase];
    }

    /**
     * @dev Get all players in the current case
     * @return Array of player addresses
     */
    function getCurrentCasePlayers() external view returns (address[] memory) {
        return casePlayers;
    }

    /**
     * @dev Get the number of players in the current case
     * @return Number of players
     */
    function getCurrentCasePlayerCount() external view returns (uint256) {
        return casePlayers.length;
    }

    /**
     * @dev Get the total prize pool for the current case
     * @return Current prize pool
     */
    function getCurrentPrizePool() external view returns (uint256) {
        return casePlayers.length * ENTRY_FEE;
    }

    /**
     * @dev Get remaining players needed to activate the current case
     * @return Number of players still needed
     */
    function getRemainingPlayersNeeded() external view returns (uint256) {
        if (casePlayers.length >= REQUIRED_PLAYERS) {
            return 0;
        }
        return REQUIRED_PLAYERS - casePlayers.length;
    }

    /**
     * @dev Get winner of a specific case
     * @param case_ Case number
     * @return Winner address
     */
    function getCaseWinner(uint256 case_) external view returns (address) {
        require(
            caseStatus[case_] == CaseStatus.Completed,
            "Case has not completed yet"
        );
        return caseWinners[case_];
    }

    /**
     * @dev Get status of a specific case
     * @param case_ Case number
     * @return Case status
     */
    function getCaseStatus(uint256 case_) external view returns (CaseStatus) {
        return caseStatus[case_];
    }

    /**
     * @dev Emergency function to allow owner to recover any ERC20 tokens
     * @param token Address of the token to recover
     */
    function recoverERC20(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to recover");

        bool success = IERC20(token).transfer(owner(), balance);
        require(success, "Token recovery failed");
    }

    /**
     * @dev Cancel current case and return all player deposits (owner only)
     */
    function cancelCase() external onlyOwner nonReentrant {
        // Return funds to all players
        for (uint i = 0; i < casePlayers.length; i++) {
            address player = casePlayers[i];
            hasPlayerDeposited[player] = false;

            bool success = usdcToken.transfer(player, ENTRY_FEE);
            require(success, "USDC transfer failed");

            emit PlayerRefunded(player, ENTRY_FEE, currentCase);
        }

        // Clear the players array
        delete casePlayers;

        // Move to next case
        currentCase++;
        caseStatus[currentCase] = CaseStatus.Pending;

        emit CaseCancelled(currentCase - 1);
    }
}
