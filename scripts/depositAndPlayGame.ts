import hre from "hardhat";
import fs from "fs";

const depositAndPlayGame = async () => {
  try {
    const ENTRY_FEE = hre.ethers.parseUnits("10", 6);
    const walletInfo = fs.readFileSync(".player-wallet-info.json", "utf-8");
    const parsedWallet = JSON.parse(walletInfo);
    const wallet = hre.ethers.Wallet.fromPhrase(parsedWallet.menmonic.phrase);
    
    // Create a signer with provider
    const provider = hre.ethers.provider;
    const signer = wallet.connect(provider);
    
    console.log("Wallet address:", wallet.address);
    
    // Check ETH balance
    const ethBalance = await provider.getBalance(wallet.address);
    console.log("ETH Balance:", hre.ethers.formatEther(ethBalance));
    
    const Parallax = await hre.ethers.getContractFactory("Parallax");
    const parallax = await Parallax.attach("0x8Fa7f8338727C00f05987cef8d587220a22e61B0");
    
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.attach("0x06DB1989Bd9396bFbFDB5EAe0A5b7629857C37B7");
    
    // Check USDC balance
    const usdcBalance = await mockUSDC.balanceOf(wallet.address);
    console.log("USDC Balance:", hre.ethers.formatUnits(usdcBalance, 6));
    
    if (usdcBalance < ENTRY_FEE) {
      console.log("ERROR: Insufficient USDC balance for entry fee");
      return;
    }
    
    // Connect wallet to contracts
    const connectedMockUSDC = mockUSDC.connect(signer);
    const connectedParallax = parallax.connect(signer);
    
    // Check allowance
    const currentAllowance = await connectedMockUSDC.allowance(
      wallet.address, 
      "0x8Fa7f8338727C00f05987cef8d587220a22e61B0"
    );
    console.log("Current allowance:", hre.ethers.formatUnits(currentAllowance, 6));
    
    // Approve tokens for spending
    console.log("Approving tokens...");
    const approveTx = await connectedMockUSDC.approve(
      "0x8Fa7f8338727C00f05987cef8d587220a22e61B0", 
      ENTRY_FEE
    );
    
    // Wait for approval transaction to be mined
    await approveTx.wait();
    console.log("Approval transaction mined:", approveTx.hash);
    
    // Check allowance again
    const newAllowance = await connectedMockUSDC.allowance(
      wallet.address, 
      "0x8Fa7f8338727C00f05987cef8d587220a22e61B0"
    );
    console.log("New allowance:", hre.ethers.formatUnits(newAllowance, 6));
    
    // Try making the deposit with gas limit
    console.log("Making deposit...");
    const depositTx = await connectedParallax.depositToPlay({
      gasLimit: 500000 // Adding explicit gas limit
    });
    
    // Wait for deposit transaction
    await depositTx.wait();
    console.log("Deposit transaction successful:", depositTx.hash);
  } catch (error) {
    console.error("Detailed error:");
    console.error(error);
  }
};

depositAndPlayGame();