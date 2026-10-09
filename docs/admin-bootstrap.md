# First admin bootstrap

MentorLoop does not expose admin registration or a public role-promotion endpoint. To create the first administrator, promote an existing account whose email has already been verified.

1. Start the local database and apply migrations: `npm run infra:up`, then `npm run db:migrate`.
2. Choose the exact email of the existing, verified account that should become the first admin.
3. In PowerShell, set the variable for the current terminal session and run the script:

   ```powershell
   $env:ADMIN_EMAIL = "admin@example.com"
   npm run admin:bootstrap -w @mentorloop/api
   Remove-Item Env:ADMIN_EMAIL
   ```

The script fails if `ADMIN_EMAIL` is missing, malformed, unknown, unverified, or belongs to a suspended account. It never creates an account or password. Re-running it for the same active admin is safe. After promotion, sign out and back in so the browser receives a fresh admin session. Keep this script and database access limited to trusted operators; never expose `ADMIN_EMAIL` or database credentials to the web client.
