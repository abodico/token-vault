use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
        seeds = [
            b"vault",
            user.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        token::authority = vault_authority,
        token::mint = mint
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: This PDA is validated using its seeds and bump.
    /// It is used as the authority of the vault token account.
    #[account(
        seeds = [b"vault-authority",
        user.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.key();

    let user_key = ctx.accounts.user.key();

    let bump_seed = [ctx.bumps.vault_authority];

    let signer_seeds: &[&[&[u8]]] = &[&[b"vault-authority", user_key.as_ref(), &bump_seed]];

    let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    token::transfer_checked(cpi_context, amount, ctx.accounts.mint.decimals)?;

    Ok(())
}
