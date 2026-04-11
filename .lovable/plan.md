
Goal

Fix the current build break on the Redirect Rules page and make Cloudflare account API tokens (`cfat_...`) work reliably across account setup and bulk redirect pages.

Implementation plan

1. Fix the immediate build error in `src/pages/RedirectRules.tsx`
- Add the missing `manualAccountId` state and wire it into the manual-token form.
- Reset that state correctly when switching between saved credentials and manual input.
- Use the account ID in token verification so the new field is functional, not just present.

2. Correct account-token verification in the backend functions
- Update `supabase/functions/validate-cloudflare/index.ts` so `cfat_` tokens always use `/accounts/{account_id}/tokens/verify` when an account ID is provided.
- Return a specific “Account API Token requires Account ID” message instead of a generic invalid API error when the token is `cfat_` and no account ID is supplied.
- Keep the exact Cloudflare error code/message in the response so users can see the real rejection reason.

3. Preserve the account ID when saving Cloudflare accounts
- Fix `src/hooks/useCloudflareAccounts.tsx` so manually supplied `accountId` is not lost when Cloudflare account listing is unavailable.
- For token-based accounts, save `validation.accountId || input.accountId` into `cloudflare_accounts.account_id`.
- When re-validating or updating a saved token account, pass the stored `account_id` back into validation instead of validating without it.

4. Make existing saved token accounts repairable
- Update `src/components/cloudflare/CloudflareAccountCard.tsx` so token-based accounts can be edited with an Account ID field.
- Extend the update flow to persist a corrected account ID for accounts that were previously saved with `null`.
- This prevents older saved `cfat_` tokens from staying permanently broken.

5. Apply the same credential logic across the bulk pages
- Update `src/pages/RedirectRules.tsx`, `src/pages/BulkRedirects.tsx`, and `src/pages/SubdomainRedirects.tsx` so manual `cfat_` tokens show an Account ID field.
- When a saved account is selected, derive both the decoded token and the stored `account_id` from that account.
- Pass `accountId` into `verify-token` everywhere, not just on the add-account dialog.

6. Fix misleading UI copy
- In `src/components/cloudflare/AddCloudflareAccountDialog.tsx`, replace the note that says the Account ID is fetched automatically.
- Clarify that for `cfat_` account tokens, the Account ID must be provided because Cloudflare’s own verify endpoint is account-specific.
- Add clearer permission hints so later failures are easier to understand:
  - Page Rules pages: `Zone:Read`, `Zone:DNS:Edit`, `Zone:Page Rules:Edit`
  - Redirect Rules page: `Zone:Read`, `Zone:DNS:Edit`, `Zone:Dynamic Redirect:Edit`

7. Verify end-to-end after implementation
- Confirm the app builds cleanly after the `manualAccountId` fix.
- Test adding a new `cfat_` token with account ID from the account settings dialog.
- Test selecting that saved account on Redirect Rules and Bulk Redirect pages.
- Confirm that:
  - valid account tokens are accepted,
  - missing account IDs show a clear message,
  - and real Cloudflare permission errors are surfaced instead of “invalid API”.

Files likely involved
- `src/pages/RedirectRules.tsx`
- `src/pages/BulkRedirects.tsx`
- `src/pages/SubdomainRedirects.tsx`
- `src/hooks/useCloudflareAccounts.tsx`
- `src/components/cloudflare/AddCloudflareAccountDialog.tsx`
- `src/components/cloudflare/CloudflareAccountCard.tsx`
- `supabase/functions/validate-cloudflare/index.ts`
- `supabase/functions/cloudflare-bulk-proxy/index.ts`

Technical details

- The uploaded screenshot confirms this is an Account API Token, and Cloudflare’s own test command uses:
  `GET /accounts/{account_id}/tokens/verify`
- Root cause 1: `RedirectRules.tsx` references `manualAccountId`/`setManualAccountId` but never declares them.
- Root cause 2: the bulk pages currently verify tokens without passing `accountId`, so valid `cfat_` tokens get rejected.
- Root cause 3: even when account setup receives a manual account ID, the save flow can drop it and store `account_id = null`, which breaks later validations.
- No database migration is needed; the existing `cloudflare_accounts.account_id` column is sufficient.
