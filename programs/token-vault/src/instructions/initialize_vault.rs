use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This PDA is validated using its seeds and bump.
    /// It acts as the authority of the vault token account.
    #[account(
        seeds = [
            b"vault-authority",
            user.key().as_ref()
        ],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = user,
        token::mint = mint,
        token::authority = vault_authority,
        seeds = [
            b"vault",
            user.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_vault(_ctx: Context<InitializeVault>) -> Result<()> {
    Ok(())
}
