const { ethers } = require("hardhat");

async function main() {
  const [owner] = await ethers.getSigners();
  
  // Get the deployed contract address
  const parallaxAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  
  // Get the contract at the deployed address
  const Parallax = await ethers.getContractFactory("Parallax");
  const parallax = await Parallax.attach(parallaxAddress);
  
  console.log("Setting up event listener...");
  
  // Listen for all events
  parallax.on("*", (event) => {
    console.log("Event received:", event);
  });
  
  console.log("Listening for events. Press Ctrl+C to stop.");
  
  // Keep the script running
  await new Promise(() => {});
}

main().catch(console.error);