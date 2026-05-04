# Payout Test Report - Creator: sid

## Current Status
- **Stripe Account ID**: `acct_1TQ6hBEavQ390NsI`
- **Payout Method**: `stripe_connect` (Automated)
- **Stripe Status**: **Inactive** (Transfers/Payouts disabled)

## Test Results
1.  **Manual Payout (manual_bank) - [SUCCESS]**
    - Checked ledger: A payout for **$4.25** (Net) was successfully processed on **2026-04-25**.
    - User's `pendingPayoutBalance` is correctly set to **$0.00**.
    - Database record `iCFvB4yywtaHm6d2SdK2` is marked as `paid`.

2.  **Automated Payout (stripe_connect) - [FAILURE]**
    - Attempted to create a test Checkout session with `transfer_data`.
    - **Error**: `Your destination account needs to have at least one of the following capabilities enabled: transfers...`
    - **Reason**: The account `acct_1TQ6hBEavQ390NsI` has `payouts_enabled: false` and `disabled_reason: "requirements.past_due"`.
    - **Missing Requirements**:
        - `individual.address.city`
        - `individual.address.line1`
        - `individual.address.postal_code`
        - `individual.dob.day/month/year`
        - `individual.first_name/last_name`
        - `individual.phone`
    - **Verification Error**: `verification_failed_keyed_identity` (Identity information could not be found).

## Recommendations
- **For sid**: Log in to the [Stripe Dashboard](https://dashboard.stripe.com/test/connect/accounts/acct_1TQ6hBEavQ390NsI) and complete the verification requirements.
- **For the App**:
    - Add a "Refresh Payout Status" button in the Payout tab to fetch the latest account status from Stripe.
    - Implement a fallback to `manual_bank` if `stripe_connect` is selected but the account is not yet active.
