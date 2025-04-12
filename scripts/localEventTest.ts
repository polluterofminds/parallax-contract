// scripts/trigger-events.js


async function main() {
  console.log("Starting Parallax events trigger script...");

  // Get signers
  const [owner, player1, player2] = await ethers.getSigners();
  console.log(`Owner address: ${owner.address}`);
  console.log(`Player1 address: ${player1.address}`);
  console.log(`Player2 address: ${player2.address}`);

  // Deploy Mock USDC token
  console.log("Deploying Mock USDC token...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log(`Mock USDC deployed to: ${mockUSDCAddress}`);

  // Mint USDC to players
  const mintAmount = ethers.parseUnits("100", 6); // 100 USDC (6 decimals)
  await mockUSDC.mint(player1.address, mintAmount);
  await mockUSDC.mint(player2.address, mintAmount);
  console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDC to each player`);

  // Deploy Parallax contract
  console.log("Deploying Parallax contract...");
  const Parallax = await ethers.getContractFactory("Parallax");
  const parallax = await Parallax.deploy(mockUSDCAddress);
  await parallax.waitForDeployment();
  const parallaxAddress = await parallax.getAddress();
  console.log(`Parallax deployed to: ${parallaxAddress}`);

  // Get contract constants
  const ENTRY_FEE = await parallax.ENTRY_FEE();
  console.log(`Entry fee: ${ethers.formatUnits(ENTRY_FEE, 6)} USDC`);

  // === STEP 1: Activate a case (will trigger CaseStatusChanged) ===
  console.log("\n=== Activating Case ===");
  const crimeInfoCID = "QmXzY7vJuaW2T4XCCFHVfgKN1AdMtFnZ1GJUhsJEkzYGRv";
  const activateTx = await parallax.activateCase(crimeInfoCID);
  await activateTx.wait();
  console.log(`Case activated with CID: ${crimeInfoCID}`);

  // === STEP 2: Player deposits (will trigger PlayerDeposited) ===
  console.log("\n=== Player Depositing ===");
  // Approve USDC spending
  await mockUSDC.connect(player1).approve(parallaxAddress, ENTRY_FEE);
  console.log(`Player1 approved ${ethers.formatUnits(ENTRY_FEE, 6)} USDC spending`);
  
  // Player deposits
  const depositTx = await parallax.connect(player1).depositToPlay();
  await depositTx.wait();
  console.log(`Player1 deposited ${ethers.formatUnits(ENTRY_FEE, 6)} USDC`);

  // === STEP 3: Second player deposits and submits solution ===
  console.log("\n=== Second Player Depositing and Submitting ===");
  // Approve USDC spending
  await mockUSDC.connect(player2).approve(parallaxAddress, ENTRY_FEE);
  console.log(`Player2 approved ${ethers.formatUnits(ENTRY_FEE, 6)} USDC spending`);
  
  // Player deposits
  const deposit2Tx = await parallax.connect(player2).depositToPlay();
  await deposit2Tx.wait();
  console.log(`Player2 deposited ${ethers.formatUnits(ENTRY_FEE, 6)} USDC`);

  // Player submits solution
  const solutionTx = await parallax.connect(player2).submitSolution();
  await solutionTx.wait();
  console.log("Player2 submitted solution");

  // === STEP 4: End case (will trigger CaseEnded) ===
  console.log("\n=== Ending Case ===");
  const endTx = await parallax.gameOver();
  await endTx.wait();
  console.log("Game ended, prizes distributed");

  // === STEP 5: Start a new case ===
  console.log("\n=== Starting New Case ===");
  const newCaseTx = await parallax.startNewCase();
  await newCaseTx.wait();
  console.log("New case started");

  // Activate new case
  const activateNewTx = await parallax.activateCase(crimeInfoCID);
  await activateNewTx.wait();
  console.log("New case activated");

  // === STEP 6: Player deposits in new case ===
  console.log("\n=== Player Depositing in New Case ===");
  await mockUSDC.connect(player1).approve(parallaxAddress, ENTRY_FEE);
  const deposit3Tx = await parallax.connect(player1).depositToPlay();
  await deposit3Tx.wait();
  console.log("Player1 deposited in new case");

  // === STEP 7: Cancel case (will trigger CaseCancelled and PlayerRefunded) ===
  console.log("\n=== Canceling Case ===");
  const cancelTx = await parallax.cancelCase();
  await cancelTx.wait();
  console.log("Case cancelled, player refunded");

  console.log("\n=== Events triggered successfully! ===");
  console.log("The following events should have been emitted:");
  console.log("- PlayerDeposited (multiple times)");
  console.log("- CaseStatusChanged (multiple times)");
  console.log("- CaseEnded (once)");
  console.log("- CaseCancelled (once)");
  console.log("- PlayerRefunded (at least once)");
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });