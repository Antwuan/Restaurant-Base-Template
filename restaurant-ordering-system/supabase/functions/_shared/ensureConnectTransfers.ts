import Stripe from 'npm:stripe@17';

export const CONNECT_ONBOARDING_ERROR =
  'Complete Stripe Connect onboarding for this restaurant';

/** v2 recipient path — present on Accounts v2; omitted on classic v1 Connect. */
type V2AccountFields = {
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: {
            status?: string | null;
          };
        };
      };
    };
  };
};

function v1TransfersStatus(account: Stripe.Account): string | undefined {
  return account.capabilities?.transfers;
}

function v2TransfersStatus(account: Stripe.Account): string | undefined {
  const v2 = account as Stripe.Account & V2AccountFields;
  return v2.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status
    ?? undefined;
}

function isTransfersActive(account: Stripe.Account): boolean {
  return v1TransfersStatus(account) === 'active' || v2TransfersStatus(account) === 'active';
}

function isTransfersRequested(account: Stripe.Account): boolean {
  const v1 = v1TransfersStatus(account);
  if (v1 && v1 !== 'unrequested') return true;
  const v2 = v2TransfersStatus(account);
  if (v2 && v2 !== 'unrequested') return true;
  return false;
}

/**
 * Destination charges require an active `transfers` capability on the connected
 * account. Request it if missing (cannot complete onboarding for them) and
 * throw a stable customer-facing error when it is not yet active.
 */
export async function ensureConnectTransfers(
  stripe: Stripe,
  accountId: string,
): Promise<void> {
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/no such account|does not exist|capability|transfers/i.test(message)) {
      throw new Error(CONNECT_ONBOARDING_ERROR);
    }
    throw err;
  }

  if (isTransfersActive(account)) return;

  if (!isTransfersRequested(account)) {
    try {
      account = await stripe.accounts.update(accountId, {
        capabilities: {
          transfers: { requested: true },
        },
      });
    } catch {
      // Requesting does not finish onboarding; still return the clear error.
    }
    if (isTransfersActive(account)) return;
  }

  throw new Error(CONNECT_ONBOARDING_ERROR);
}
