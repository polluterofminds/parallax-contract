import hre from "hardhat";

const setCaseInfo = async () => {
    const Parallax = await hre.ethers.getContractFactory("Parallax");
    const parallax = await Parallax.attach("0x1385A7d244516C8256e3C37b02345ba6A2871152");
    const tx = await parallax.setCaseCrimeInfo("ipfs://bafkreifdj2d3wvswcxve2fx3tm3fjrw5ykx3ypcmsx7b7dp6usai4p7dyi")
    console.log(tx);
}

setCaseInfo();