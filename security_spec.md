# Security Spec: PII Sanitization & Public Data Privacy

## Data Invariants
1. **Public/Private Separation**: Data from the `pharmacies` collection must never leak PII (emails, user IDs, payment IDs) in public endpoints.
2. **Identity Integrity**: Pharmacy IDs returned in public lists must always correspond to the actual pharmacy record to ensure correct attribution (clicks, geocoding).
3. **Internal State Protection**: Subscription status, customer IDs, and internal metrics must be excluded from public responses.

## Sanitization Strategy: Allow-listing
Instead of attempting to remove sensitive fields (deny-listing), we strictly define what is allowed in a public response for a Pharmacy object.

### Public Pharmacy Schema
- `id`: Pharmacy unique ID
- `name`: Display name
- `street`, `number`, `neighborhood`, `city`, `state`, `zip`, `cep`: Location data
- `phone`, `whatsapp`, `website`: Contact data
- `lat`, `lng`, `latitude`, `longitude`: Geospatial data
- `description`: Public description
- `logo_url`: Branding
- `is_active`: Operational status
- `created_at`, `updated_at`: Metadata timestamps

## Universal Sanitization Patterns

### 1. The `sanitizePublicPharmacy` Helper
A pure function that maps a document ID and its raw data to the allow-listed schema.

### 2. Standard Response Headers
Public endpoints should enforce caching where appropriate but prioritize data integrity.

## Identified Vulnerabilities & Fixes

### Issue: Highlight ID Overwriting Pharmacy ID
- **Vulnerability**: The `/api/public/highlights` endpoint currently overwrites the pharmacy's `id` with the `highlight_id`, breaking click tracking and potential data reconciliation in the frontend.
- **Fix**: Preserve the pharmacy ID as the primary `id` field and move the highlight record identifier to `highlight_id`.

### Issue: Manual Implementation Risk
- **Vulnerability**: Manually applying sanitization at each return point is prone to developer error.
- **Fix**: Standardize on a response utility or ensure all public endpoints use the helper function consistently.

## Verification Checklist
- [ ] `/api/public/pharmacies` uses `sanitizePublicPharmacy`.
- [ ] `/api/public/on-call` uses `sanitizePublicPharmacy`.
- [ ] `/api/public/highlights` uses `sanitizePublicPharmacy` and preserves pharmacy `id`.
- [ ] No `email` field is returned in any of the above.
- [ ] No `user_id` field is returned in any of the above.
- [ ] No `mp_customer_id` or `stripe_customer_id` is returned.
