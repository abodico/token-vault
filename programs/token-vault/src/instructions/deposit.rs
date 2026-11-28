use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::VaultError;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        token::authority = user,
        token::mint = mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::authority = vault_authority,
        token::mint = mint,
        seeds = [
        b"vault",
        user.key().as_ref(),
        mint.key().as_ref()
    ],
    bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: This PDA is validated using its seeds and bump.
    /// It is used as the authority of the vault token account.
    #[account(
        seeds = [
            b"vault-authority",
            user.key().as_ref()
        ],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::InvalidAmount);

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.key();

    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);

    token::transfer_checked(cpi_context, amount, ctx.accounts.mint.decimals)?;

    emit!(crate::events::DepositEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        vault: ctx.accounts.vault.key(),
        amount,
    });

    Ok(())
}
