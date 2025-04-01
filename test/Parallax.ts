const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Parallax", function () {
  let Parallax: any;
  let parallax: any;
  let MockUSDC: any;
  let mockUSDC: any;
  let MaliciousUSDC: any;
  let maliciousUSDC: any;

  //  @ts-ignore
  let owner, player1, player2, player3, player4, player5;
  //  @ts-ignore
  let player6, player7, player8, player9, player10, player11;
  const IPFS_CID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
  let ENTRY_FEE: any;

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

    // Deploy Parallax contract - use getAddress() instead of target
    Parallax = await ethers.getContractFactory("Parallax");
    parallax = await Parallax.deploy(await mockUSDC.getAddress());

    // Set ENTRY_FEE (10 USDC with 6 decimals)
    ENTRY_FEE = ethers.parseUnits("10", 6);

    // Get the Parallax contract address
    const parallaxAddress = await parallax.getAddress();

    // Mint USDC to players
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
      // In ethers v6, the signer address is directly available as player.address
      await mockUSDC.mint(player.address, ENTRY_FEE);
      // Use parallaxAddress instead of parallax.address
      await mockUSDC.connect(player).approve(parallaxAddress, ENTRY_FEE);
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
      expect(await parallax.ENTRY_FEE()).to.equal(ENTRY_FEE);
      expect(await parallax.COMMISSION_PERCENTAGE()).to.equal(10n);
      expect(await parallax.REQUIRED_PLAYERS()).to.equal(10n);
    });
  });

  describe("Setting Case Crime Info", function () {
    it("Should set crime info for the current case", async function () {
      await parallax.setCaseCrimeInfo(IPFS_CID);
      expect(await parallax.getCaseCrimeInfoCID(1)).to.equal(IPFS_CID);
    });

    it("Should emit NewCaseStarted event when setting crime info for the first time", async function () {
      await expect(parallax.setCaseCrimeInfo(IPFS_CID))
        .to.emit(parallax, "NewCaseStarted")
        .withArgs(1n, IPFS_CID); // Note: using 1n instead of 1 for BigInt
    });

    it("Should emit CaseCrimeInfoUpdated event when updating crime info", async function () {
      await parallax.setCaseCrimeInfo(IPFS_CID);

      const newCID = "QmNewCrimeInfoCID";
      await expect(parallax.setCaseCrimeInfo(newCID))
        .to.emit(parallax, "CaseCrimeInfoUpdated")
        .withArgs(1, newCID);
    });

    it("Should not allow setting crime info for active cases", async function () {
      await parallax.setCaseCrimeInfo(IPFS_CID);

      // Get 10 players to make the case active
      for (let i = 0; i < 10; i++) {
        const player = [
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
        ][i];
        await parallax.connect(player).depositToPlay();
      }

      const newCID = "QmNewCrimeInfoCID";
      await expect(parallax.setCaseCrimeInfo(newCID)).to.be.revertedWith(
        "Can only set crime info for pending cases"
      );
    });

    it("Should not allow setting empty crime info", async function () {
      await expect(parallax.setCaseCrimeInfo("")).to.be.revertedWith(
        "Crime info CID cannot be empty"
      );
    });

    it("Should not allow non-owners to set crime info", async function () {
      await expect(
        parallax.connect(player1).setCaseCrimeInfo(IPFS_CID)
      ).to.be.reverted;
    });
  });

  describe("Player Deposits", function () {
    beforeEach(async function () {
      // Set crime info for the case
      await parallax.setCaseCrimeInfo(IPFS_CID);
    });

    it("Should allow a player to deposit", async function () {
      await parallax.connect(player1).depositToPlay();

      expect(await parallax.hasPlayerDeposited(player1.address)).to.be.true;
      expect(await parallax.getCurrentCasePlayerCount()).to.equal(1);
      expect(await mockUSDC.balanceOf(await parallax.getAddress())).to.equal(ENTRY_FEE);
    });

    it("Should emit PlayerDeposited event", async function () {
      await expect(parallax.connect(player1).depositToPlay())
        .to.emit(parallax, "PlayerDeposited")
        .withArgs(player1.address, ENTRY_FEE, 1);
    });

    it("Should not allow deposits without crime info", async function () {
      // Deploy a new contract without setting crime info
      const newParallax = await Parallax.deploy(await mockUSDC.getAddress());

      // Approve the new contract
      await mockUSDC.connect(player1).approve(await newParallax.getAddress(), ENTRY_FEE);

      await expect(
        newParallax.connect(player1).depositToPlay()
      ).to.be.revertedWith("Case has no crime info yet");
    });

    it("Should not allow a player to deposit twice in the same case", async function () {
      await parallax.connect(player1).depositToPlay();
      await expect(
        parallax.connect(player1).depositToPlay()
      ).to.be.revertedWith("Player has already deposited for this case");
    });

    it("Should change case status to Active when required players reached", async function () {
      // Add 9 players
      for (let i = 0; i < 9; i++) {
        const player = [
          player1,
          player2,
          player3,
          player4,
          player5,
          player6,
          player7,
          player8,
          player9,
        ][i];
        await parallax.connect(player).depositToPlay();
      }

      // Case should still be pending
      expect(await parallax.getCaseStatus(1)).to.equal(0); // 0 = Pending

      // Add the 10th player to trigger status change
      await expect(parallax.connect(player10).depositToPlay())
        .to.emit(parallax, "CaseStatusChanged")
        .withArgs(1, 1); // 1 = Active

      expect(await parallax.getCaseStatus(1)).to.equal(1); // 1 = Active
    });

    it("Should accurately report remaining players needed", async function () {
      expect(await parallax.getRemainingPlayersNeeded()).to.equal(10);

      // Add 5 players
      for (let i = 0; i < 5; i++) {
        const player = [player1, player2, player3, player4, player5][i];
        await parallax.connect(player).depositToPlay();
      }

      expect(await parallax.getRemainingPlayersNeeded()).to.equal(5);

      // Add 5 more
      for (let i = 0; i < 5; i++) {
        const player = [player6, player7, player8, player9, player10][i];
        await parallax.connect(player).depositToPlay();
      }

      expect(await parallax.getRemainingPlayersNeeded()).to.equal(0);
    });
  });

  describe("Ending a Game", function () {
    beforeEach(async function () {
      // Set crime info for the case
      await parallax.setCaseCrimeInfo(IPFS_CID);

      // Add 10 players
      for (let i = 0; i < 10; i++) {
        const player = [
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
        ][i];
        await parallax.connect(player).depositToPlay();
      }
    });

    it("Should end game and distribute prizes correctly", async function () {
      const totalPrize = ENTRY_FEE * 10n;
      const ownerCommission = totalPrize * 10n / 100n;
      const winnerPrize = totalPrize - ownerCommission;
      
      const ownerBalanceBefore = await mockUSDC.balanceOf(owner.address);
      const winnerBalanceBefore = await mockUSDC.balanceOf(player1.address);
      
      await parallax.gameOver(player1.address);
      
      const ownerBalanceAfter = await mockUSDC.balanceOf(owner.address);
      const winnerBalanceAfter = await mockUSDC.balanceOf(player1.address);
      
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(ownerCommission);
      expect(winnerBalanceAfter - winnerBalanceBefore).to.equal(winnerPrize);
    });

    it("Should emit CaseEnded event", async function () {
      const totalPrize = ENTRY_FEE * 10n;
      const ownerCommission = totalPrize * 10n / 100n;
      const winnerPrize = totalPrize - ownerCommission;

      await expect(parallax.gameOver(player1.address))
        .to.emit(parallax, "CaseEnded")
        .withArgs(1, player1.address, winnerPrize);
    });

    it("Should move to the next case", async function () {
      await parallax.gameOver(player1.address);

      expect(await parallax.currentCase()).to.equal(2);
      expect(await parallax.getCaseStatus(2)).to.equal(0); // 0 = Pending
    });

    it("Should reset player deposits for the next case", async function () {
      await parallax.gameOver(player1.address);
      
      // Set crime info for the new case
      await parallax.setCaseCrimeInfo(IPFS_CID);
      
      // Player1 needs to approve spending for the new game
      const parallaxAddress = await parallax.getAddress();
      await mockUSDC.connect(player1).approve(parallaxAddress, ENTRY_FEE);
      
      // Mint more USDC to player1 if needed
      await mockUSDC.mint(player1.address, ENTRY_FEE);
      
      // Player1 should be able to deposit again
      await parallax.connect(player1).depositToPlay();
      expect(await parallax.hasPlayerDeposited(player1.address)).to.be.true;
    });

    it("Should not allow ending a game without enough players", async function () {
      // Deploy new contract
      const newParallax = await Parallax.deploy(await mockUSDC.getAddress());

      // Set crime info
      await newParallax.setCaseCrimeInfo(IPFS_CID);

      // Add only 5 players
      for (let i = 0; i < 5; i++) {
        const player = [player1, player2, player3, player4, player5][i];
      
        // Mint more USDC to player if needed
        await mockUSDC.mint(player.address, ENTRY_FEE);
        await mockUSDC.connect(player).approve(await newParallax.getAddress(), ENTRY_FEE);
        await newParallax.connect(player).depositToPlay();
      }

      await expect(newParallax.gameOver(player1.address)).to.be.revertedWith(
        "Not enough players to end case"
      );
    });

    it("Should not allow ending a game with a non-participating winner", async function () {
      await expect(parallax.gameOver(player11.address)).to.be.revertedWith(
        "Winner is not a participating player"
      );
    });

    it("Should not allow non-owners to end the game", async function () {
      await expect(
        parallax.connect(player1).gameOver(player1.address)
      ).to.be.reverted;
    });
  });

  describe("Multiple Game Lifecycle", function () {
    it("Should track multiple games correctly", async function () {
      // Game 1
      await parallax.setCaseCrimeInfo(IPFS_CID);

      for (let i = 0; i < 10; i++) {
        const player = [
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
        ][i];
        await mockUSDC.mint(player.address, ENTRY_FEE);
        await mockUSDC.connect(player).approve(await parallax.getAddress(), ENTRY_FEE);
        await parallax.connect(player).depositToPlay();
      }

      await parallax.gameOver(player1.address);

      // Game 2
      await parallax.setCaseCrimeInfo("QmGame2CID");

      for (let i = 0; i < 10; i++) {
        const player = [
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
        ][i];
        await mockUSDC.mint(player.address, ENTRY_FEE);
        await mockUSDC.connect(player).approve(await parallax.getAddress(), ENTRY_FEE);
        await parallax.connect(player).depositToPlay();
      }

      await parallax.gameOver(player2.address);

      // Verify case history
      expect(await parallax.getCaseWinner(1)).to.equal(player1.address);
      expect(await parallax.getCaseWinner(2)).to.equal(player2.address);
      expect(await parallax.getCaseCrimeInfoCID(1)).to.equal(IPFS_CID);
      expect(await parallax.getCaseCrimeInfoCID(2)).to.equal("QmGame2CID");
      expect(await parallax.currentCase()).to.equal(3);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle USDC transfer failures", async function () {
      // Use the malicious USDC already deployed in beforeEach

      // Deploy game with malicious token
      const maliciousGame = await Parallax.deploy(await maliciousUSDC.getAddress());

      // Set crime info
      await maliciousGame.setCaseCrimeInfo(IPFS_CID);

      // Mint tokens to player
      await maliciousUSDC.mint(player1.address, ENTRY_FEE);
      await maliciousUSDC
        .connect(player1)
        .approve(await maliciousGame.getAddress(), ENTRY_FEE);

      // Should revert on deposit due to transfer failure
      await expect(
        maliciousGame.connect(player1).depositToPlay()
      ).to.be.revertedWith("USDC transfer failed");
    });

    it("Should allow recovering tokens sent by mistake", async function () {
      // Send some extra USDC to the contract
      await mockUSDC.mint(owner.address, ENTRY_FEE);
      await mockUSDC.transfer(await parallax.getAddress(), ENTRY_FEE);
      
      const balanceBefore = await mockUSDC.balanceOf(owner.address);
      await parallax.recoverERC20(await mockUSDC.getAddress());
      const balanceAfter = await mockUSDC.balanceOf(owner.address);
      
      // Use subtraction operator instead of .sub() method
      expect(balanceAfter - balanceBefore).to.equal(ENTRY_FEE);
    });
  });

  describe("Cancelling a Case", function () {
    beforeEach(async function () {
      // Set crime info for the case
      await parallax.setCaseCrimeInfo(IPFS_CID);
      
      // Add 5 players (not enough to activate the case)
      for (let i = 0; i < 5; i++) {
        const player = [player1, player2, player3, player4, player5][i];
        await parallax.connect(player).depositToPlay();
      }
    });
    
    it("Should refund all players when cancelling a case", async function () {
      // Record player balances before cancellation
      const playerBalancesBefore = [];
      for (let i = 0; i < 5; i++) {
        const player = [player1, player2, player3, player4, player5][i];
        playerBalancesBefore.push(await mockUSDC.balanceOf(player.address));
      }
      
      // Cancel the case
      await expect(parallax.cancelCase())
        .to.emit(parallax, "CaseCancelled")
        .withArgs(1);
      
      // Verify all players received their refunds
      for (let i = 0; i < 5; i++) {
        const player = [player1, player2, player3, player4, player5][i];
        const balanceAfter = await mockUSDC.balanceOf(player.address);
        expect(balanceAfter - playerBalancesBefore[i]).to.equal(ENTRY_FEE);
      }
    });
    
    it("Should move to the next case after cancellation", async function () {
      // Current case should be 1
      expect(await parallax.currentCase()).to.equal(1);
      
      // Cancel the case
      await parallax.cancelCase();
      
      // Case 1 should be marked as cancelled (or similar status)
      // This will depend on how you implement the cancel functionality
      
      // Current case should now be 2
      expect(await parallax.currentCase()).to.equal(2);
      expect(await parallax.getCaseStatus(2)).to.equal(0); // 0 = Pending
    });
    
    it("Should reset player deposits after cancellation", async function () {
      // Players have deposited in case 1
      expect(await parallax.hasPlayerDeposited(player1.address)).to.be.true;
      
      // Cancel the case
      await parallax.cancelCase();
      
      // Player deposits should be reset
      expect(await parallax.hasPlayerDeposited(player1.address)).to.be.false;
      
      // Player array should be cleared
      expect(await parallax.getCurrentCasePlayerCount()).to.equal(0);
    });
    
    it("Should only allow the owner to cancel a case", async function () {
      // Non-owner should not be able to cancel
      await expect(
        parallax.connect(player1).cancelCase()
      ).to.be.reverted;
      
      // Owner should be able to cancel
      await expect(parallax.cancelCase()).to.not.be.reverted;
    });
    
    it("Should only allow cancelling pending cases", async function () {
      // Get to 10 players to make the case active
      for (let i = 5; i < 10; i++) {
        const player = [player6, player7, player8, player9, player10][i - 5];
        await parallax.connect(player).depositToPlay();
      }
      
      // Case should now be active
      expect(await parallax.getCaseStatus(1)).to.equal(1); // 1 = Active
      
      // Should not allow cancelling an active case
      await expect(parallax.cancelCase()).to.be.revertedWith(
        "Can only cancel pending cases"
      );
    });
    
    it("Should have zero USDC balance after cancellation", async function () {
      // Initial contract balance should be 5 * ENTRY_FEE
      const balanceBefore = await mockUSDC.balanceOf(await parallax.getAddress());
      expect(balanceBefore).to.equal(ENTRY_FEE * 5n);
      
      // Cancel the case
      await parallax.cancelCase();
      
      // Final contract balance should be 0
      const balanceAfter = await mockUSDC.balanceOf(await parallax.getAddress());
      expect(balanceAfter).to.equal(0);
    });
  });
});
