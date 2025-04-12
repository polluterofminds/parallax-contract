const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Parallax", function () {
  let Parallax;
  let parallax;
  let MockUSDC;
  let mockUSDC;
  let MaliciousUSDC;
  let maliciousUSDC;

  let owner, player1, player2, player3, player4, player5;
  let player6, player7, player8, player9, player10, player11;
  const IPFS_CID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
  let ENTRY_FEE;
  let EXTRA_SOLUTION_FEE;

  beforeEach(async function () {
    // Get signers
    [
      owner,
      player1,
      player2,
      player3,
      player4,
      player5,
      player6,
      player7,
      player8,
      player9,
      player10,
      player11,
    ] = await ethers.getSigners();

    // Deploy mock USDC token
    MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();

    // Deploy malicious USDC for testing
    MaliciousUSDC = await ethers.getContractFactory("MaliciousUSDC");
    maliciousUSDC = await MaliciousUSDC.deploy();

    // Deploy Parallax contract
    Parallax = await ethers.getContractFactory("Parallax");
    parallax = await Parallax.deploy(await mockUSDC.getAddress());

    // Get constants from contract
    ENTRY_FEE = await parallax.ENTRY_FEE();
    EXTRA_SOLUTION_FEE = await parallax.EXTRA_SOLUTION_FEE();

    // Get the Parallax contract address
    const parallaxAddress = await parallax.getAddress();

    // Mint USDC to players (both entry fee and extra solution fee)
    const totalAmount = ENTRY_FEE + EXTRA_SOLUTION_FEE;
    for (const player of [
      player1,
      player2,
      player3,
      player4,
      player5,
      player6,
      player7,
      player8,
      player9,
      player10,
      player11,
    ]) {
      await mockUSDC.mint(player.address, totalAmount);
      await mockUSDC.connect(player).approve(parallaxAddress, totalAmount);
    }
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await parallax.owner()).to.equal(owner.address);
    });

    it("Should set the right USDC token", async function () {
      expect(await parallax.usdcToken()).to.equal(await mockUSDC.getAddress());
    });

    it("Should initialize with case 1 in Pending status", async function () {
      expect(await parallax.currentCase()).to.equal(1n);
      expect(await parallax.getCaseStatus(1)).to.equal(0n); // 0n = Pending
    });

    it("Should have correct constants", async function () {
      expect(await parallax.ENTRY_FEE()).to.equal(ethers.parseUnits("5", 6)); // 5 USDC
      expect(await parallax.EXTRA_SOLUTION_FEE()).to.equal(ethers.parseUnits("2", 6)); // 2 USDC
      expect(await parallax.COMMISSION_PERCENTAGE()).to.equal(10n);
      // REMOVED: REQUIRED_PLAYERS constant no longer exists
    });
  });

  describe("Case Activation with Crime Info", function () {
    it("Should set crime info and activate the case", async function () {
      await parallax.activateCase(IPFS_CID);
      expect(await parallax.getCaseCrimeInfoCID(1)).to.equal(IPFS_CID);
      expect(await parallax.getCaseStatus(1)).to.equal(1n); // 1n = Active
    });

    it("Should emit appropriate events when activating a case", async function () {
      await expect(parallax.activateCase(IPFS_CID))
        .to.emit(parallax, "CaseCrimeInfoSet")
        .withArgs(1n, IPFS_CID)
        .and.to.emit(parallax, "CaseActivated")
        .withArgs(1n)
        .and.to.emit(parallax, "CaseStatusChanged")
        .withArgs(1n, 1n); // 1n = Active
    });

    it("Should not allow setting empty crime info", async function () {
      await expect(parallax.activateCase("")).to.be.revertedWith(
        "CID cannot be empty"
      );
    });

    it("Should not allow non-owners to activate a case", async function () {
      await expect(
        parallax.connect(player1).activateCase(IPFS_CID)
      ).to.be.reverted;
    });

    it("Should not allow activating a non-pending case", async function () {
      // Activate once
      await parallax.activateCase(IPFS_CID);
      
      // Try to activate again
      await expect(parallax.activateCase("QmNewCrimeInfoCID")).to.be.revertedWith(
        "Case is not pending"
      );
    });
  });

  describe("Player Deposits", function () {
    beforeEach(async function () {
      // Activate the case with crime info
      await parallax.activateCase(IPFS_CID);
    });

    it("Should allow a player to deposit", async function () {
      await parallax.connect(player1).depositToPlay();

      expect(await parallax.checkPlayerDepositStatus(1, player1.address)).to.be.true;
      expect(await parallax.getCasePlayerCount(1)).to.equal(1);
      expect(await mockUSDC.balanceOf(await parallax.getAddress())).to.equal(ENTRY_FEE);
    });

    it("Should emit PlayerDeposited event", async function () {
      await expect(parallax.connect(player1).depositToPlay())
        .to.emit(parallax, "PlayerDeposited")
        .withArgs(1n, player1.address, ENTRY_FEE);
    });

    it("Should not allow deposits for inactive cases", async function () {
      // Deploy a new contract without activating the case
      const newParallax = await Parallax.deploy(await mockUSDC.getAddress());
      // Note: not calling activateCase()

      // Approve the new contract
      await mockUSDC.connect(player1).approve(await newParallax.getAddress(), ENTRY_FEE);

      await expect(
        newParallax.connect(player1).depositToPlay()
      ).to.be.revertedWith("Case is not active");
    });

    it("Should not allow a player to deposit twice in the same case", async function () {
      await parallax.connect(player1).depositToPlay();
      await expect(
        parallax.connect(player1).depositToPlay()
      ).to.be.revertedWith("Player has already deposited for this case");
    });
  });

  describe("Solution Submissions", function () {
    beforeEach(async function () {
      // Activate the case with crime info
      await parallax.activateCase(IPFS_CID);
      // Player 1 deposits
      await parallax.connect(player1).depositToPlay();
    });

    it("Should allow owner to submit a solution for a player", async function () {
      await parallax.submitSolution(player1.address);
      
      // Check that player is in the solvers list
      const solvers = await parallax.getCaseSolvers(1);
      expect(solvers.length).to.equal(1);
      expect(solvers[0]).to.equal(player1.address);
    });

    it("Should emit SolutionSubmitted event", async function () {
      await expect(parallax.submitSolution(player1.address))
        .to.emit(parallax, "SolutionSubmitted")
        .withArgs(1n, player1.address);
    });

    it("Should not allow submitting a solution for a player who hasn't deposited", async function () {
      await expect(
        parallax.submitSolution(player2.address)
      ).to.be.revertedWith("Player has not deposited");
    });

    it("Should not allow submitting a solution twice for the same player", async function () {
      await parallax.submitSolution(player1.address);
      
      await expect(
        parallax.submitSolution(player1.address)
      ).to.be.revertedWith("Player has already submitted a solution for this case");
    });

    it("Should not allow non-owners to submit solutions", async function () {
      await expect(
        parallax.connect(player1).submitSolution(player1.address)
      ).to.be.reverted;
    });

    it("Should allow paying for extra solution attempts", async function () {
      // Pay for extra solution attempt
      await expect(parallax.connect(player1).payForExtraSolutionAttempt())
        .to.emit(parallax, "ExtraSolutionAttemptPaid")
        .withArgs(1n, player1.address, EXTRA_SOLUTION_FEE);
        
      // Check that payment was recorded
      expect(await parallax.extraSolutionAttempts(1, player1.address)).to.equal(1);
    });

    it("Should not allow paying for extra solution attempt without depositing", async function () {
      await expect(
        parallax.connect(player2).payForExtraSolutionAttempt()
      ).to.be.revertedWith("You must deposit to participate in this case");
    });
  });

  describe("Ending a Game", function () {
    beforeEach(async function () {
      // Activate the case with crime info
      await parallax.activateCase(IPFS_CID);

      // Add 3 players
      for (const player of [player1, player2, player3]) {
        await parallax.connect(player).depositToPlay();
        // Owner submits solutions for players
        await parallax.submitSolution(player.address);
      }
      
      // Add 2 more players who don't submit solutions
      for (const player of [player4, player5]) {
        await parallax.connect(player).depositToPlay();
      }
    });

    it("Should end game and distribute prizes correctly to all solvers", async function () {
      const totalPrize = ENTRY_FEE * 5n; // 5 players deposited
      const ownerCommission = (totalPrize * 10n) / 100n; // 10% commission
      const solverPrizePool = totalPrize - ownerCommission;
      const prizePerSolver = solverPrizePool / 3n; // 3 solvers
      
      // Check balances before
      const ownerBalanceBefore = await mockUSDC.balanceOf(owner.address);
      const solver1BalanceBefore = await mockUSDC.balanceOf(player1.address);
      const solver2BalanceBefore = await mockUSDC.balanceOf(player2.address);
      const solver3BalanceBefore = await mockUSDC.balanceOf(player3.address);
      
      // End the game
      await parallax.gameOver();
      
      // Check balances after
      const ownerBalanceAfter = await mockUSDC.balanceOf(owner.address);
      const solver1BalanceAfter = await mockUSDC.balanceOf(player1.address);
      const solver2BalanceAfter = await mockUSDC.balanceOf(player2.address);
      const solver3BalanceAfter = await mockUSDC.balanceOf(player3.address);
      
      // Calculate expected payouts (owner gets commission + remainder)
      const ownerPayout = ownerCommission + (solverPrizePool % 3n);
      
      // Check payouts
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(ownerPayout);
      expect(solver1BalanceAfter - solver1BalanceBefore).to.equal(prizePerSolver);
      expect(solver2BalanceAfter - solver2BalanceBefore).to.equal(prizePerSolver);
      expect(solver3BalanceAfter - solver3BalanceBefore).to.equal(prizePerSolver);
    });

    it("Should emit CaseEnded event", async function () {
      // Get the list of solvers
      const solvers = await parallax.getCaseSolvers(1);
      
      // Calculate prize pool
      const totalPrize = ENTRY_FEE * 5n; // 5 players
      const ownerCommission = (totalPrize * 10n) / 100n; // 10% commission
      const solverPrizePool = totalPrize - ownerCommission;
      
      await expect(parallax.gameOver())
        .to.emit(parallax, "CaseEnded")
        .withArgs(1n, solvers, solverPrizePool);
    });

    it("Should not allow ending a game with no solvers", async function () {
      // Deploy a new contract
      const newParallax = await Parallax.deploy(await mockUSDC.getAddress());
      
      // Set up the case
      await newParallax.activateCase(IPFS_CID);
      
      // Add players but no solvers
      for (const player of [player1, player2]) {
        // Mint sufficient USDC to the players for this new contract
        await mockUSDC.mint(player.address, ENTRY_FEE);
        await mockUSDC.connect(player).approve(await newParallax.getAddress(), ENTRY_FEE);
        await newParallax.connect(player).depositToPlay();
        // Note: not submitting solutions
      }
      
      await expect(newParallax.gameOver()).to.be.revertedWith(
        "No one submitted a solution"
      );
    });

    it("Should not allow non-owners to end the game", async function () {
      await expect(
        parallax.connect(player1).gameOver()
      ).to.be.reverted;
    });

    it("Should not allow ending a non-active game", async function () {
      // First finish the current game
      await parallax.gameOver();
      
      // Try to end it again
      await expect(parallax.gameOver()).to.be.revertedWith(
        "Case is not active"
      );
    });
  });

  describe("Starting a New Case", function () {
    beforeEach(async function () {
      // Set up and complete a case
      await parallax.activateCase(IPFS_CID);
      await parallax.connect(player1).depositToPlay();
      await parallax.submitSolution(player1.address);
      await parallax.gameOver();
    });

    it("Should allow owner to start a new case after the previous one completes", async function () {
      expect(await parallax.currentCase()).to.equal(1n);
      
      await expect(parallax.startNewCase())
        .to.emit(parallax, "NewCaseReady")
        .withArgs(2n);
        
      expect(await parallax.currentCase()).to.equal(2n);
      expect(await parallax.getCaseStatus(2)).to.equal(0n); // Pending
    });

    it("Should not allow starting a new case if the current one isn't complete", async function () {
      // Deploy a new contract
      const newParallax = await Parallax.deploy(await mockUSDC.getAddress());
      
      // Set up the case but don't complete it
      await newParallax.activateCase(IPFS_CID);
      
      // Try to start a new case
      await expect(newParallax.startNewCase()).to.be.revertedWith(
        "Current case must be finished or cancelled first"
      );
    });

    it("Should not allow non-owners to start a new case", async function () {
      await expect(
        parallax.connect(player1).startNewCase()
      ).to.be.reverted;
    });
  });

  describe("Cancelling a Case", function () {
    beforeEach(async function () {
      // Activate the case with crime info
      await parallax.activateCase(IPFS_CID);
      
      // Add 3 players
      for (const player of [player1, player2, player3]) {
        await parallax.connect(player).depositToPlay();
      }
    });
    
    it("Should refund all players when cancelling a case", async function () {
      // Record player balances before cancellation
      const playerBalancesBefore = [];
      for (const player of [player1, player2, player3]) {
        playerBalancesBefore.push(await mockUSDC.balanceOf(player.address));
      }
      
      // Cancel the case
      await expect(parallax.cancelCase())
        .to.emit(parallax, "CaseCancelled")
        .withArgs(1n);
      
      // Verify all players received their refunds
      for (let i = 0; i < 3; i++) {
        const player = [player1, player2, player3][i];
        const balanceAfter = await mockUSDC.balanceOf(player.address);
        expect(balanceAfter - playerBalancesBefore[i]).to.equal(ENTRY_FEE);
      }
    });
    
    it("Should mark the case as cancelled", async function () {
      await parallax.cancelCase();
      expect(await parallax.getCaseStatus(1)).to.equal(3n); // 3 = Cancelled
    });
    
    it("Should reset player deposits after cancellation", async function () {
      // Players have deposited in case 1
      expect(await parallax.checkPlayerDepositStatus(1, player1.address)).to.be.true;
      
      // Cancel the case
      await parallax.cancelCase();
      
      // Player deposits should be reset
      expect(await parallax.checkPlayerDepositStatus(1, player1.address)).to.be.false;
      
      // Player array should be cleared
      expect(await parallax.getCasePlayerCount(1)).to.equal(0);
    });
    
    it("Should only allow the owner to cancel a case", async function () {
      // Non-owner should not be able to cancel
      await expect(
        parallax.connect(player1).cancelCase()
      ).to.be.reverted;
      
      // Owner should be able to cancel
      await expect(parallax.cancelCase()).to.not.be.reverted;
    });
    
    it("Should have zero USDC balance after cancellation (except extra fees)", async function () {
      // Initial contract balance should be 3 * ENTRY_FEE
      const balanceBefore = await mockUSDC.balanceOf(await parallax.getAddress());
      expect(balanceBefore).to.equal(ENTRY_FEE * 3n);
      
      // Cancel the case
      await parallax.cancelCase();
      
      // Final contract balance should be 0
      const balanceAfter = await mockUSDC.balanceOf(await parallax.getAddress());
      expect(balanceAfter).to.equal(0n);
    });
  });

  describe("Token Recovery", function () {
    it("Should allow recovering tokens sent by mistake", async function () {
      // Send some extra USDC to the contract
      await mockUSDC.mint(owner.address, ENTRY_FEE);
      await mockUSDC.transfer(await parallax.getAddress(), ENTRY_FEE);
      
      const balanceBefore = await mockUSDC.balanceOf(owner.address);
      await parallax.recoverERC20(await mockUSDC.getAddress());
      const balanceAfter = await mockUSDC.balanceOf(owner.address);
      
      expect(balanceAfter - balanceBefore).to.equal(ENTRY_FEE);
    });
    
    it("Should only allow the owner to recover tokens", async function () {
      await expect(
        parallax.connect(player1).recoverERC20(await mockUSDC.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Multiple Game Lifecycle", function () {
    it("Should handle multiple game cycles correctly", async function () {
      // ===== Game 1 =====
      await parallax.activateCase(IPFS_CID);

      // Players 1-3 deposit and owner submits solutions for them
      for (const player of [player1, player2, player3]) {
        await parallax.connect(player).depositToPlay();
        await parallax.submitSolution(player.address);
      }

      // End the game
      await parallax.gameOver();
      
      // Start a new case
      await parallax.startNewCase();

      // ===== Game 2 =====
      const game2CID = "QmGame2CID";
      await parallax.activateCase(game2CID);

      // Get new approvals for game 2
      const parallaxAddress = await parallax.getAddress();
      for (const player of [player1, player2, player3, player4]) {
        await mockUSDC.mint(player.address, ENTRY_FEE);
        await mockUSDC.connect(player).approve(parallaxAddress, ENTRY_FEE);
      }

      // Players 1, 2, 4 deposit and owner submits solutions for them
      for (const player of [player1, player2, player4]) {
        await parallax.connect(player).depositToPlay();
        await parallax.submitSolution(player.address);
      }

      // End game 2
      await parallax.gameOver();
      
      // Start a new case
      await parallax.startNewCase();

      // ===== Verify case history =====
      // Case IDs
      expect(await parallax.currentCase()).to.equal(3n);
      
      // Case crime info
      expect(await parallax.getCaseCrimeInfoCID(1)).to.equal(IPFS_CID);
      expect(await parallax.getCaseCrimeInfoCID(2)).to.equal(game2CID);
      
      // Case statuses
      expect(await parallax.getCaseStatus(1)).to.equal(2n); // Completed
      expect(await parallax.getCaseStatus(2)).to.equal(2n); // Completed
      expect(await parallax.getCaseStatus(3)).to.equal(0n); // Pending
      
      // Case solvers
      const case1Solvers = await parallax.getCaseSolvers(1);
      expect(case1Solvers.length).to.equal(3);
      
      const case2Solvers = await parallax.getCaseSolvers(2);
      expect(case2Solvers.length).to.equal(3);
      expect(case2Solvers).to.include(player4.address);
    });
  });
});