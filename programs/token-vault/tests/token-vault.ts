import * as anchor from "@anchor-lang/core"
import { Program } from "@anchor-lang/core"
import { TokenVault } from "../../../target/types/token_vault"
import {
    createMint,
    getAccount,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { expect } from "chai"
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js"
import BN from "bn.js"

describe("token-vault", () => {
    const provider = anchor.AnchorProvider.env()
    anchor.setProvider(provider)
    const program = anchor.workspace.TokenVault as Program<TokenVault>
    const user = provider.wallet.publicKey

    let mint: PublicKey
    let vaultAuthority: PublicKey
    let vault: PublicKey
    let userTokenAccount: PublicKey

    before(async () => {
        mint = await createMint(
            provider.connection,
            provider.wallet.payer!,
            user,
            null,
            9,
        )

        const userAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer!,
            mint,
            user,
        )

        userTokenAccount = userAta.address

        await mintTo(
            provider.connection,
            provider.wallet.payer!,
            mint,
            userTokenAccount,
            provider.wallet.payer!,
            100_000_000_000n,
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

    it("Deposits tokens into the vault", async () => {
        const depositAmount = new BN("30000000000")

        await program.methods
            .deposit(depositAmount)
            .accountsPartial({
                user,
                mint,
                vault,
                vaultAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                userTokenAccount,
            })
            .rpc()

        const userAccount = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultAccount = await getAccount(provider.connection, vault)

        expect(userAccount.amount).to.equal(70_000_000_000n)
        expect(vaultAccount.amount).to.equal(30_000_000_000n)
    })

    it("Withdraws tokens from the vault", async () => {
        const withdrawAmount = new BN("10000000000")

        await program.methods
            .withdraw(withdrawAmount)
            .accountsPartial({
                user,
                mint,
                vault,
                vaultAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                userTokenAccount,
            })
            .rpc()

        const userAccount = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultAccount = await getAccount(provider.connection, vault)

        expect(userAccount.amount).to.equal(80_000_000_000n)
        expect(vaultAccount.amount).to.equal(20_000_000_000n)
    })

    it("Should reject deposit from another user's token account", async () => {
        const bob = Keypair.generate()

        const bobAta = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer!,
            mint,
            bob.publicKey,
        )

        let failed = false

        try {
            await program.methods
                .deposit(new BN("1000000000"))
                .accountsPartial({
                    user,
                    userTokenAccount: bobAta.address,
                    vault,
                    vaultAuthority,
                    mint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc()
        } catch (error) {
            failed = true
        }

        expect(failed).to.equal(true)
    })
})
