import hre from "hardhat";

const setCaseInfo = async () => {
    const Parallax = await hre.ethers.getContractFactory("Parallax");
    const parallax = await Parallax.attach("0x8e8f1660da1935EF48BEb669463f426A5acE0CB5");
    const tx = await parallax.activateCase("ipfs://bafkreifdj2d3wvswcxve2fx3tm3fjrw5ykx3ypcmsx7b7dp6usai4p7dyi")
    console.log(tx);
}

setCaseInfo();