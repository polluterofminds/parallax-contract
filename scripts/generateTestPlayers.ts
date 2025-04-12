import hre from "hardhat";

const PLAYERS_TO_GENERATE = 6;

async function generateWallet() {
  const wallet = hre.ethers.Wallet.createRandom();
  const connectedWallet = wallet.connect(hre.ethers.provider);
  const info = {
    address: wallet.address,
    menmonic: wallet.mnemonic,
    privateKey: wallet.privateKey,
  };

  console.log(info);
  return connectedWallet;
}

const generateTestPlayers = async () => {
  const [sender] = await hre.ethers.getSigners();
  const ethAmount = "0.000002";
  const weiAmount = hre.ethers.parseEther(ethAmount);

  let currentCount = 0;
  while (currentCount < PLAYERS_TO_GENERATE) {
    try {
        const wallet = await generateWallet();
        const ENTRY_FEE = hre.ethers.parseUnits("10", 6);
    
        const Parallax = await hre.ethers.getContractFactory("Parallax");
        const parallax = await Parallax.attach("0x1385A7d244516C8256e3C37b02345ba6A2871152");
    
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const mockUSDC = await MockUSDC.attach(
          "0x06DB1989Bd9396bFbFDB5EAe0A5b7629857C37B7"
        );
    
        console.log("Minting USDC for: ", wallet.address);
    
        await mockUSDC.mint(wallet.address, ENTRY_FEE);
    
        console.log(
            `Sending ${ethAmount} ETH from ${sender.address} to ${wallet.address}`
          );
        const tx = await sender.sendTransaction({
          to: wallet.address,
          value: weiAmount,
        });
    
        console.log(`Transaction hash: ${tx.hash}`);
    
        // Wait for the transaction to be mined
        await tx.wait();
    
        console.log("Transaction confirmed");
    
        const connectedMockUSDC = await mockUSDC.connect(wallet);
        const connectedParallax = await parallax.connect(wallet);
        
        // Check allowance
        const currentAllowance = await connectedMockUSDC.allowance(
          wallet.address, 
          "0x1385A7d244516C8256e3C37b02345ba6A2871152"
        );
        console.log("Current allowance:", hre.ethers.formatUnits(currentAllowance, 6));
        
        // Approve tokens for spending
        console.log("Approving tokens...");
        const approveTx = await connectedMockUSDC.approve(
          "0x1385A7d244516C8256e3C37b02345ba6A2871152", 
          ENTRY_FEE
        );
        
        // Wait for approval transaction to be mined
        await approveTx.wait();
        console.log("Approval transaction mined:", approveTx.hash);
        
        // Check allowance again
        const newAllowance = await connectedMockUSDC.allowance(
          wallet.address, 
          "0x1385A7d244516C8256e3C37b02345ba6A2871152"
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
        currentCount++;   
    } catch (error) {
        console.log(error);        
        throw error;
    }    
  }
};

generateTestPlayers();