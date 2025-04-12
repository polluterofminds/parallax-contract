import hre from "hardhat";
import fs from "fs";

async function generateWallet() {
    const wallet = hre.ethers.Wallet.createRandom();
    const info = {
        address: wallet.address, 
        menmonic: wallet.mnemonic, 
        privateKey: wallet.privateKey
    }

    console.log(info);
    fs.writeFileSync(".player-wallet-info.json", JSON.stringify(info));
    return info;
}

const mintUSDC = async () => {
    // const playerWallet = await generateWallet();
    const ENTRY_FEE = hre.ethers.parseUnits("10", 6);
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.attach("0x06DB1989Bd9396bFbFDB5EAe0A5b7629857C37B7");
    const tx = await mockUSDC.mint("0xd34724060c8F4C6B5982736D91e37A79ec199D23", ENTRY_FEE);
    console.log(tx);
}

mintUSDC();