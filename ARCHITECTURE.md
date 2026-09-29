# TIIN 2.0 architecture

## Current safe transition

The original `index.html` remains the data and feature source while `styles/tiin-v2.css` and `src/tiin-v2.js` progressively replace its presentation and interaction layer. This is intentional: current local data stays readable with no key migration.

## Legacy data contract

- `txns_<year>_<zero-based-month>` — transactions by month
- `goals`, `templates`, `recurring`, `budgets`, `payment_items` — JSON collections
- `payment_status_<year>_<two-digit-month>` — payment tracker status
- `lang`, `theme` — user interface preferences

## Next database step

Run `supabase/schema.sql` in a newly created Supabase project, then configure the public URL and publishable key outside git. The schema has RLS enabled and is designed for `user_id` ownership, with `workspace_id` available for Personal, Pabliki.kz, NUQTE and future spaces.

## Migration principle

Local data is never deleted by migration. The app must upload a snapshot, verify the count and checksum, mark `sync_metadata.migration_completed_at`, then begin server-first sync. Offline writes remain in a local queue until acknowledged by the server.
