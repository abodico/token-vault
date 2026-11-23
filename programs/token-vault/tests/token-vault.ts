import * as anchor from "@anchor-lang/core"
import { Program } from "@anchor-lang/core"
import { TokenVault } from "../../../target/types/token_vault"
import { createMint, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { expect } from "chai"
import { PublicKey, SystemProgram } from "@solana/web3.js"

describe("token-vault", () => {
    const provider = anchor.AnchorProvider.env()
    anchor.setProvider(provider)
    const program = anchor.workspace.TokenVault as Program<TokenVault>
    const user = provider.wallet.publicKey

    let mint: PublicKey
    let vaultAuthority: PublicKey
    let vault: PublicKey

    before(async () => {
        mint = await createMint(
            provider.connection,
            provider.wallet.payer!,
            user,
            null,
            9,
        )
    })

    it("Initialize the vault", async () => {
        ;[vaultAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault-authority"), user.toBuffer()],
            program.programId,
        )
        ;[vault] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), user.toBuffer(), mint.toBuffer()],
            program.programId,
        )

        await program.methods
            .initializeVault()
            .accountsPartial({
                user,
                vaultAuthority,
                vault,
                mint,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc()

        const vaultAccount = await getAccount(provider.connection, vault)

        expect(vaultAccount.mint.toBase58()).to.equal(mint.toBase58())
        expect(vaultAccount.owner.toBase58()).to.equal(
            vaultAuthority.toBase58(),
        )
    })
})
