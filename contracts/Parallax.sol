// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Parallax Game Escrow (Modified)
 * @dev A contract that escrows USDC for a game played in cases.
 * Each case is initialized with an IPFS CID containing crime information.
 * Owner explicitly activates a case.
 * Players deposit ENTRY_FEE USDC to participate in an active case.
 * Players can submit solutions (only once, managed offchain) to an active case.
 * Players can pay an EXTRA_SOLUTION_FEE for an additional solution attempt
 * Owner ends the case (gameOver), distributing winnings evenly among solvers (owner gets 10% + remainder).
 * Owner can cancel a case, refunding players.
 * Owner must explicitly start the next case number using startNewCase().
 */
contract Parallax is Ownable, ReentrancyGuard {
    IERC20 public usdcToken;

    uint256 public constant ENTRY_FEE = 5 * 10 ** 6; // 5 USDC (USDC has 6 decimals)
    uint256 public constant EXTRA_SOLUTION_FEE = 2 * 10 ** 6; // 2 USDC
    uint256 public constant COMMISSION_PERCENTAGE = 10; // 10%

    // REMOVED: REQUIRED_PLAYERS constant

    enum CaseStatus {
        Pending,   // Initial state, crime info can be set
        Active,    // Owner activated, players can deposit, submit, pay extra
        Completed, // gameOver called, prizes distributed
        Cancelled  // Case cancelled by owner, players refunded
    }

    uint256 public currentCase = 1;

    // Mappings track state per case number
    mapping(uint256 => mapping(address => bool)) public hasPlayerDeposited; // Tracks deposits per case
    mapping(uint256 => address[]) public casePlayers; // Tracks players per case
    mapping(uint256 => address[]) public caseSolvers; // Tracks solvers per case
    mapping(uint256 => mapping(address => bool)) public hasPlayerSolved; // Tracks submissions per case
    mapping(uint256 => mapping(address => uint256)) public extraSolutionAttempts; // Tracks extra payments per case
    mapping(uint256 => uint256) public casePrizes; // Tracks prize pool distributed to solvers per case
    mapping(uint256 => CaseStatus) public caseStatus; // Tracks status per case
    mapping(uint256 => string) public caseCrimeInfoCID; // Tracks crime info CID per case

    // --- Events ---
    event PlayerDeposited(uint256 indexed case_, address indexed player, uint256 amount);
    event CaseStatusChanged(uint256 indexed case_, CaseStatus status);
    event CaseActivated(uint256 indexed case_); // Event for explicit activation
    event CaseEnded(uint256 indexed case_, address[] solvers, uint256 prize);
    event NewCaseReady(uint256 indexed case_); // Event when owner prepares the next case number
    event CaseCrimeInfoSet(uint256 indexed case_, string crimeInfoCID); // Event for setting/updating crime info
    event CaseCancelled(uint256 indexed case_);
    event PlayerRefunded(uint256 indexed case_, address indexed player, uint256 amount);
    event SolutionSubmitted(uint256 indexed case_, address indexed solver);
    event ExtraSolutionAttemptPaid(uint256 indexed case_, address indexed player, uint256 amount);

    /**
     * @dev Constructor sets the USDC token address and initializes the first case.
     * @param _usdcToken Address of the USDC token contract.
     */
    constructor(address _usdcToken) Ownable(msg.sender) {
        require(_usdcToken != address(0), "Invalid USDC token address");
        usdcToken = IERC20(_usdcToken);
        caseStatus[currentCase] = CaseStatus.Pending;
        // Owner needs to call setCaseCrimeInfo and activateCase for case 1.
    }

    /**
     * @dev Owner sets the IPFS CID for the current case's crime information.
     * Can only be called when the case is Pending.
     * @param crimeInfoCID IPFS CID containing crime information. Owner activates the current case, allowing players to join and submit solutions.
     * Requires the case to be Pending and have crime info set.
     */
    function activateCase(string calldata crimeInfoCID) external onlyOwner {
        require(
            caseStatus[currentCase] == CaseStatus.Pending,
            "Case is not pending"
        );

        require(bytes(crimeInfoCID).length > 0, "CID cannot be empty");

        caseStatus[currentCase] = CaseStatus.Active;
        caseCrimeInfoCID[currentCase] = crimeInfoCID;
        emit CaseCrimeInfoSet(currentCase, crimeInfoCID);
        emit CaseActivated(currentCase);
        emit CaseStatusChanged(currentCase, CaseStatus.Active);
    }

    /**
     * @dev Allow player to deposit USDC to participate in the current case.
     * Case must be Active. Player must not have deposited for this case yet.
     */
    function depositToPlay() external nonReentrant {
        uint256 caseNum = currentCase; // Cache currentCase for safety
        require(
            caseStatus[caseNum] == CaseStatus.Active,
            "Case is not active"
        );
        require(
            !hasPlayerDeposited[caseNum][msg.sender],
            "Player has already deposited for this case"
        );

        // Transfer ENTRY_FEE USDC from player to this contract
        bool success = usdcToken.transferFrom(
            msg.sender,
            address(this),
            ENTRY_FEE
        );
        require(success, "USDC transfer failed");

        // Mark player as deposited and add to players array for this case
        hasPlayerDeposited[caseNum][msg.sender] = true;
        casePlayers[caseNum].push(msg.sender);

        emit PlayerDeposited(caseNum, msg.sender, ENTRY_FEE);
        // REMOVED: Auto-activation logic based on player count.
    }

    /**
     * @dev Allow a player who has deposited to submit a solution to the current case.
     * Case must be Active. Only one submission allowed per player per case.
     */
    function submitSolution() external nonReentrant {
        uint256 caseNum = currentCase;
        require(
            caseStatus[caseNum] == CaseStatus.Active,
            "Case is not active"
        );
        require(
            hasPlayerDeposited[caseNum][msg.sender],
            "You must deposit to participate in this case"
        );
        require(
            !hasPlayerSolved[caseNum][msg.sender],
            "You have already submitted a solution for this case"
        );

        caseSolvers[caseNum].push(msg.sender);
        hasPlayerSolved[caseNum][msg.sender] = true;

        emit SolutionSubmitted(caseNum, msg.sender);
    }

    /**
     * @dev Allow a player who has deposited to pay for an extra solution attempt.
     * Case must be Active.
     * NOTE: This function collects the fee but currently does not enable further submissions in submitSolution().
     */
    function payForExtraSolutionAttempt() external nonReentrant {
        uint256 caseNum = currentCase;
        require(
            caseStatus[caseNum] == CaseStatus.Active,
            "Case is not active"
        );
        require(
            hasPlayerDeposited[caseNum][msg.sender],
            "You must deposit to participate in this case"
        );

        // Transfer EXTRA_SOLUTION_FEE USDC from player to this contract
        bool success = usdcToken.transferFrom(
            msg.sender,
            address(this),
            EXTRA_SOLUTION_FEE
        );
        require(success, "USDC transfer failed");

        extraSolutionAttempts[caseNum][msg.sender]++;
        emit ExtraSolutionAttemptPaid(caseNum, msg.sender, EXTRA_SOLUTION_FEE);
    }

    /**
     * @dev Owner ends the current case, distributes prizes to solvers.
     * Case must be Active and have at least one solver (submitter).
     * Does NOT automatically start the next case. Owner must call startNewCase() separately.
     */
    function gameOver() external onlyOwner nonReentrant {
        uint256 caseNum = currentCase;
        require(caseStatus[caseNum] == CaseStatus.Active, "Case is not active");
        require(caseSolvers[caseNum].length > 0, "No one submitted a solution");
        // REMOVED: require minimum player count

        address[] memory players = casePlayers[caseNum]; // Cache player list for prize calculation and reset
        address[] memory solvers = caseSolvers[caseNum]; // Cache solver list for distribution

        // Calculate total prize from deposits (ignores extra solution fees for now)
        uint256 totalPrize = players.length * ENTRY_FEE;
        uint256 numSolvers = solvers.length;

        uint256 commission = 0;
        uint256 solverPrizePool = 0;
        uint256 prizePerSolver = 0;
        uint256 remainder = 0;

        if (totalPrize > 0) {
            commission = (totalPrize * COMMISSION_PERCENTAGE) / 100;
            solverPrizePool = totalPrize - commission;

            if (numSolvers > 0) {
                prizePerSolver = solverPrizePool / numSolvers;
                remainder = solverPrizePool % numSolvers; // Remainder goes to owner
            } else {
                 // Should not happen due to require check above, but defensively:
                 remainder = solverPrizePool; // All remaining pool goes to owner if no solvers
            }

            // Transfer commission + remainder to the owner
            if (commission + remainder > 0) {
                bool successOwner = usdcToken.transfer(owner(), commission + remainder);
                require(successOwner, "Owner commission transfer failed");
            }

            // Distribute prize to each solver
            // Note: Potential gas limit issue if numSolvers is extremely large. Consider pull pattern for large scale.
            for (uint256 i = 0; i < numSolvers; i++) {
                 if (prizePerSolver > 0) {
                    bool successSolver = usdcToken.transfer(solvers[i], prizePerSolver);
                    // Consider implications if one transfer fails. Currently reverts all.
                    require(successSolver, "Solver prize distribution failed");
                 }
            }
        }

        // Record the total prize distributed to solvers for this case
        casePrizes[caseNum] = solverPrizePool;
        caseStatus[caseNum] = CaseStatus.Completed;

        emit CaseStatusChanged(caseNum, CaseStatus.Completed);
        emit CaseEnded(caseNum, solvers, solverPrizePool);

        // Reset player deposit status for the completed case
        for (uint i = 0; i < players.length; i++) {
            // Reset deposit status in the mapping specific to this case number
            hasPlayerDeposited[caseNum][players[i]] = false;
        }

        // Clear the players array for the completed case (optional, saves gas on future reads if needed)
        delete casePlayers[caseNum];

        // Keep caseSolvers, hasPlayerSolved, extraSolutionAttempts for historical data query via view functions.

        // REMOVED: Auto-start of new case. Owner must call startNewCase().
    }

    /**
     * @dev Owner cancels the current case and refunds all player deposits.
     * Case must be Pending or Active.
     * Does NOT automatically start the next case. Owner must call startNewCase() separately.
     */
    function cancelCase() external onlyOwner nonReentrant {
        uint256 caseNum = currentCase;
        require(
            caseStatus[caseNum] == CaseStatus.Pending || caseStatus[caseNum] == CaseStatus.Active,
            "Case cannot be cancelled in its current state"
        );

        address[] memory players = casePlayers[caseNum]; // Cache player list for refunds

        // Refund entry fee to all players who deposited for this case
        // Note: Potential gas limit issue if players array is extremely large. Consider pull pattern for large scale.
        for (uint i = 0; i < players.length; i++) {
            address player = players[i];
            // Check if they actually deposited (should be true if in array, but defensive check)
            if (hasPlayerDeposited[caseNum][player]) {
                bool success = usdcToken.transfer(player, ENTRY_FEE);
                // Consider implications if one transfer fails. Currently reverts all.
                require(success, "USDC refund transfer failed");

                // Reset deposit status for the cancelled case
                hasPlayerDeposited[caseNum][player] = false;
                emit PlayerRefunded(caseNum, player, ENTRY_FEE);
            }
        }

        // Clear the players array for this cancelled case
        delete casePlayers[caseNum];

        // Mark the case as Cancelled
        caseStatus[caseNum] = CaseStatus.Cancelled;
        emit CaseStatusChanged(caseNum, CaseStatus.Cancelled);
        emit CaseCancelled(caseNum);

        // REMOVED: Auto-start of new case. Owner must call startNewCase().
    }

    /**
     * @dev Owner prepares the contract state for the next case number.
     * Requires the current case to be Completed or Cancelled.
     */
    function startNewCase() external onlyOwner {
         uint256 completedCaseNum = currentCase; // The case that just finished
         require(
            caseStatus[completedCaseNum] == CaseStatus.Completed || caseStatus[completedCaseNum] == CaseStatus.Cancelled,
            "Current case must be finished or cancelled first"
        );

        currentCase++;
        caseStatus[currentCase] = CaseStatus.Pending; // New case starts as Pending
        emit NewCaseReady(currentCase);
        // Owner now needs to call setCaseCrimeInfo() and activateCase() for this new currentCase.
    }

    // --- View Functions ---

    /**
     * @dev Get the IPFS CID for a specific case's crime information.
     * @param case_ Case number.
     * @return Crime information IPFS CID string.
     */
    function getCaseCrimeInfoCID(uint256 case_) external view returns (string memory) {
        return caseCrimeInfoCID[case_];
    }

    /**
     * @dev Get the status of the current case.
     * @return Current case status enum value.
     */
    function getCurrentCaseStatus() external view returns (CaseStatus) {
        return caseStatus[currentCase];
    }

     /**
     * @dev Get the status of a specific case.
     * @param case_ Case number.
     * @return Case status enum value.
     */
    function getCaseStatus(uint256 case_) external view returns (CaseStatus) {
        return caseStatus[case_];
    }

    /**
     * @dev Get all players (addresses that deposited) for a specific case.
     * @param case_ Case number.
     * @return Array of player addresses.
     */
    function getCasePlayers(uint256 case_) external view returns (address[] memory) {
        return casePlayers[case_];
    }

    /**
     * @dev Get the number of players who deposited for a specific case.
     * @param case_ Case number.
     * @return Number of players.
     */
    function getCasePlayerCount(uint256 case_) external view returns (uint256) {
        return casePlayers[case_].length;
    }

    /**
     * @dev Calculates the current total prize pool based on deposits for a specific case.
     * @param case_ Case number.
     * @return Current prize pool value in USDC (with decimals).
     */
    function getCasePrizePool(uint256 case_) external view returns (uint256) {
        // Prize pool is based on number of players who paid entry fee.
        return casePlayers[case_].length * ENTRY_FEE;
    }

    /**
     * @dev Get solvers (addresses that submitted) of a specific case.
     * @param case_ Case number.
     * @return Array of solver addresses.
     */
    function getCaseSolvers(uint256 case_) external view returns (address[] memory) {
        // Returns solvers regardless of case status (useful for viewing history).
        return caseSolvers[case_];
    }

     /**
     * @dev Check if a specific player has deposited for a specific case.
     * @param case_ Case number.
     * @param player Address of the player.
     * @return True if the player has deposited for the case, false otherwise.
     */
    function checkPlayerDepositStatus(uint256 case_, address player) external view returns(bool) {
        return hasPlayerDeposited[case_][player];
    }

    // REMOVED: getRemainingPlayersNeeded function (obsolete)

    // --- Emergency Function ---
    /**
     * @dev Emergency function to allow owner to recover *any* ERC20 tokens accidentally sent.
     * Use with caution, especially regarding the main game token (USDC).
     * @param token Address of the ERC20 token contract to recover.
     */
    function recoverERC20(address token) external onlyOwner {
        // Optional: Add check to prevent recovering game USDC unless intended
        // require(token != address(usdcToken), "Use game functions for USDC");

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to recover");

        bool success = IERC20(token).transfer(owner(), balance);
        require(success, "Token recovery failed");
    }
}