-- How the money actually moved.
--
-- Danish bank descriptions encode the payment rail — "VISA/DANKORT",
-- "MobilePay", "BS" for Betalingsservice, "Overførsel" — and throwing that
-- away loses the answer to a question people genuinely ask: how much of my
-- spending is card, how much is MobilePay, what is on direct debit.
--
-- It is also what makes MobilePay trackable at all. Personal MobilePay has no
-- consumer API; the transactions arrive through the bank feed, and this column
-- is what lets us pick them back out.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS transactions_user_channel_idx
  ON transactions (user_id, payment_channel);

-- Counterparty on a person-to-person payment, which is not a "merchant".
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS counterparty TEXT;
