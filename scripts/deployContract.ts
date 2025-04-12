import hre from "hardhat";

async function deploy() {
    // const MockUSDC = await ethers.getContractFactory("MockUSDC");
    // const mockUSDC = await MockUSDC.deploy();
    const mockUSDCAddress = "0x06DB1989Bd9396bFbFDB5EAe0A5b7629857C37B7"//await mockUSDC.getAddress()
    const Parallax = await ethers.getContractFactory("Parallax");
    const parallax = await Parallax.deploy(mockUSDCAddress);
    console.log({
        contractAddress: await parallax.getAddress(),
        usdcAddress: mockUSDCAddress
    })
}

deploy();