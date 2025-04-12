import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers"
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const keyInfo = fs.readFileSync(".local-wallet-info.json", "utf-8");
const wallet = JSON.parse(keyInfo);

const config: HardhatUserConfig = {
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  networks: {
    hardhat: {
    },
    base: {
      url: "https://base-mainnet.g.alchemy.com/v2/KuIgY2Ie6n37U-OhbtAQKWfQ_DJv9iaA", 
      accounts: [wallet.privateKey]
    },
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/KuIgY2Ie6n37U-OhbtAQKWfQ_DJv9iaA",
      accounts: [wallet.privateKey]
    }
  },
  solidity: "0.8.28",
};

export default config;
