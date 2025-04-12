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
    fs.writeFileSync(".local-wallet-info.json", JSON.stringify(info));
}

generateWallet();