ALTER TABLE bingo_membership ADD COLUMN client_id UUID;
ALTER TABLE bingo_membership ADD COLUMN service VARCHAR(120);
ALTER TABLE bingo_membership ADD COLUMN account_label VARCHAR(120);
ALTER TABLE bingo_membership ADD COLUMN archived BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE bingo_membership ADD COLUMN version INTEGER DEFAULT 0 NOT NULL;
CREATE UNIQUE INDEX bingo_membership_client_idx ON bingo_membership (owner_id, client_id);

ALTER TABLE bingo_membership_reminder ADD COLUMN client_period_id UUID;
ALTER TABLE bingo_membership_reminder ADD COLUMN starts_on DATE;
ALTER TABLE bingo_membership_reminder ADD COLUMN amount_minor BIGINT;
ALTER TABLE bingo_membership_reminder ADD COLUMN currency VARCHAR(3);
CREATE UNIQUE INDEX bingo_reminder_client_idx ON bingo_membership_reminder (owner_id, client_period_id);
