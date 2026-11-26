import * as anchor from "@anchor-lang/core"
import { Program } from "@anchor-lang/core"
import { TokenVault } from "../../../target/types/token_vault"
import {
    createAssociatedTokenAccount,
    createMint,
    getAccount,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import { expect } from "chai"
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js"
import BN from "bn.js"

import { AnchorError } from "@anchor-lang/core"

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

    it("Should reject deposit for a token that is not related to this vault", async () => {
        const newMint = await createMint(
            provider.connection,
            provider.wallet.payer!,
            user,
            null,
            9,
        )

        const depositAmount = new BN("10000000000")
        let failed = false

        const userAccount = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultAccount = await getAccount(provider.connection, vault)

        const userBefore = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultBefore = await getAccount(provider.connection, vault)

        try {
            await program.methods
                .deposit(depositAmount)
                .accountsPartial({
                    user,
                    mint: newMint,
                    vault,
                    vaultAuthority,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    userTokenAccount,
                })
                .rpc()
        } catch (err) {
            failed = true
        }

        expect(failed).to.equal(true)
        expect(userAccount.amount).to.equal(userBefore.amount)
        expect(vaultAccount.amount).to.equal(vaultBefore.amount)
    })

    it("Should reject deposit tokens into the wrong vault", async () => {
        const depositAmount = new BN("10000000000")

        const fakeVault = await createAssociatedTokenAccount(
            provider.connection,
            provider.wallet.payer!,
            mint,
            vaultAuthority,
            undefined,
            TOKEN_PROGRAM_ID,
            undefined,
            true,
        )

        const userBefore = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultBefore = await getAccount(provider.connection, vault)

        let failed = false

        try {
            await program.methods
                .deposit(depositAmount)
                .accountsPartial({
                    user,
                    mint,
                    vault: fakeVault,
                    vaultAuthority,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    userTokenAccount,
                })
                .rpc()
        } catch (error) {
            failed = true
        }
        const userAccount = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultAccount = await getAccount(provider.connection, vault)

        expect(failed).to.equal(true)
        expect(userAccount.amount).to.equal(userBefore.amount)
        expect(vaultAccount.amount).to.equal(vaultBefore.amount)
    })

    it("Should reject to withdraw tokens from the vault for the wrong PDA", async () => {
        const withdrawAmount = new BN("10000000000")
        const bob = Keypair.generate()

        let failed = false
        try {
            await program.methods
                .withdraw(withdrawAmount)
                .accountsPartial({
                    user: bob.publicKey,
                    mint,
                    vault,
                    vaultAuthority,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    userTokenAccount,
                })
                .signers([bob])
                .rpc()
        } catch (error) {
            failed = true
        }

        const userAccount = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultAccount = await getAccount(provider.connection, vault)

        expect(failed).to.equal(true)
        expect(userAccount.amount).to.equal(80_000_000_000n)
        expect(vaultAccount.amount).to.equal(20_000_000_000n)
    })

    it("Should reject to withdraw tokens from the vault using the wrong Authority", async () => {
        const withdrawAmount = new BN("10000000000")
        const bob = Keypair.generate()
        const [bobAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault-authority"), bob.publicKey.toBuffer()],
            program.programId,
        )

        const userBefore = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultBefore = await getAccount(provider.connection, vault)

        let failed = false
        try {
            await program.methods
                .withdraw(withdrawAmount)
                .accountsPartial({
                    user,
                    mint,
                    vault,
                    vaultAuthority: bobAuthority,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    userTokenAccount,
                })
                .rpc()
        } catch (error) {
            failed = true
        }

        const userAccount = await getAccount(
            provider.connection,
            userTokenAccount,
        )

        const vaultAccount = await getAccount(provider.connection, vault)

        expect(failed).to.equal(true)
        expect(userAccount.amount).to.equal(userBefore.amount)
        expect(vaultAccount.amount).to.equal(vaultBefore.amount)
    })

    it("Should reject to Deposit 0 tokens into the vault", async () => {
        const depositAmount = new BN("0")

        let failed = false
        try {
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
        } catch (error: unknown) {
            failed = true
            if (error instanceof AnchorError) {
                expect(error.error.errorCode.code).to.equal("InvalidAmount")
            } else {
                throw error
            }
        }
        expect(failed).to.equal(true)
    })

    it("Should reject to withdraw 0 tokens from the vault", async () => {
        const withdrawAmount = new BN("0")

        let failed = false
        try {
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
        } catch (error: unknown) {
            failed = true
            if (error instanceof AnchorError) {
                expect(error.error.errorCode.code).to.equal("InvalidAmount")
            } else {
                throw error
            }
        }
        expect(failed).to.equal(true)
    })
})
