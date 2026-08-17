#!/usr/bin/env bash
# Ops helper: seed Vault cron secret + reschedule hooks + print selftest.
# Usage (against live or local DB URL):
#   CRON_HOOK_SECRET='...' APP_BASE_URL='https://…' ./scripts/ops-phase-b-cron.sh "$DATABASE_URL"
set -euo pipefail
DB_URL="${1:-}"
SECRET="${CRON_HOOK_SECRET:-}"
BASE="${APP_BASE_URL:-}"
if [[ -z "$DB_URL" || -z "$SECRET" ]]; then
  echo "Usage: CRON_HOOK_SECRET=… [APP_BASE_URL=…] $0 <database_url>" >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -v secret="$SECRET" \
  -v base="${BASE:-}" <<'SQL'
DO $$
DECLARE
  v_secret text := :'secret';
  v_base text := nullif(:'base', '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_hook_secret') THEN
    PERFORM vault.create_secret(v_secret, 'cron_hook_secret', 'Cron hook auth');
  ELSE
    PERFORM vault.update_secret(
      (SELECT id FROM vault.secrets WHERE name = 'cron_hook_secret' LIMIT 1),
      v_secret
    );
  END IF;
  IF v_base IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'app_base_url') THEN
      PERFORM vault.create_secret(v_base, 'app_base_url', 'Public app URL for cron hooks');
    ELSE
      PERFORM vault.update_secret(
        (SELECT id FROM vault.secrets WHERE name = 'app_base_url' LIMIT 1),
        v_base
      );
    END IF;
  END IF;
END $$;

SELECT public.reschedule_cron_hooks_with_vault();
SELECT * FROM public.phase_b_ops_selftest();
SQL
