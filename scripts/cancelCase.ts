import hre from "hardhat";

const cancelCase = async () => {
    const Parallax = await hre.ethers.getContractFactory("Parallax");
    const parallax = await Parallax.attach("0x8Fa7f8338727C00f05987cef8d587220a22e61B0");
    const tx = await parallax.cancelCase();
    console.log(tx);
}

cancelCase();