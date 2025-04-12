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
      // Enable mining mode
      mining: {
        auto: true,
        interval: 0 // Mine immediately when transactions are received
      },
      // Enable websocket support for event testing
      allowUnlimitedContractSize: true,
      blockGasLimit: 100000000,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      // Add WebSocket support
      accounts: {
        mnemonic: "test test test test test test test test test test test junk"
      }
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
