# Profile Guard Edge authentication integration checks

Run only against a local Supabase stack after `supabase db reset` and after
serving `profile-guard-update`. Do not point these commands at production.

```powershell
$api = 'http://127.0.0.1:54321/functions/v1/profile-guard-update'
$anon = (npx.cmd supabase status -o env | Select-String '^ANON_KEY=').ToString().Split('=', 2)[1].Trim('"')

# 401: missing Authorization
curl.exe -i -X POST $api -H "apikey: $anon" -H 'Content-Type: application/json' -d '{"updates":{"bio":"Safe bio"}}'

# 401: malformed token
curl.exe -i -X POST $api -H "apikey: $anon" -H 'Authorization: Bearer malformed' -H 'Content-Type: application/json' -d '{"updates":{"bio":"Safe bio"}}'

# 401: expired/invalid signed token
curl.exe -i -X POST $api -H "apikey: $anon" -H 'Authorization: Bearer <expired-test-user-jwt>' -H 'Content-Type: application/json' -d '{"updates":{"bio":"Safe bio"}}'

# 200: valid local test-user JWT and safe owner update
curl.exe -i -X POST $api -H "apikey: $anon" -H 'Authorization: Bearer <valid-local-test-user-jwt>' -H 'Content-Type: application/json' -d '{"updates":{"bio":"Safe bio"}}'

# 403: verified user attempts to choose another target
curl.exe -i -X POST $api -H "apikey: $anon" -H 'Authorization: Bearer <valid-local-test-user-jwt>' -H 'Content-Type: application/json' -d '{"user_id":"91000000-0000-4000-8000-000000000002","updates":{"bio":"Safe bio"}}'
```

The function verifies the bearer token with `supabase.auth.getUser(token)` and
uses only the returned `user.id` as `p_user_id`. It never decodes identity from
unverified JWT payload data.
