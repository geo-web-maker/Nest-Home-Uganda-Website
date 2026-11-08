# Signed agreement storage (Backblaze B2 + Object Lock)

Sealed agreement PDFs can live in their own bucket that refuses edits and deletes until a retention date.

## One-time Backblaze setup
1. Create a NEW bucket and turn on **Object Lock** when creating it. Object Lock cannot be added to an existing bucket.
   Keep it **Private**. Do not set a default retention; the app sets it per file.
2. Create an Application Key limited to that bucket (read, write, list; also `writeFileRetentions` / `readFileRetentions`).
   Do not give it `bypassGovernance`.
3. Set in `.env` (values from the key page; the endpoint looks like `https://s3.<region>.backblazeb2.com`):
   - `S3_BUCKET_SIGNED`, `S3_SIGNED_ENDPOINT`, `S3_SIGNED_REGION`, `S3_SIGNED_KEY`, `S3_SIGNED_SECRET`
   - `S3_SIGNED_RETENTION_DAYS` (default 2555, about 7 years)
   - `S3_SIGNED_LOCK_MODE`: `GOVERNANCE` (default; a special key can still bypass) or `COMPLIANCE` (nobody can shorten or delete, not even you)

## What the app does
- New completed agreements are written to the signed bucket with the retention date. Each record stores `sealed.bucket` and `sealed.object_lock`.
- Older agreements stay in the private bucket and still download normally.
- If `S3_BUCKET_SIGNED` is empty the app behaves as before (private bucket, no lock).
- Deleting a locked agreement removes its database record only; the locked PDF stays until retention ends.
- Diagnostics runs never use the locked bucket.

## Privacy note
The signature record and certificate now include the signer's plain IP address, email and phone. Mention this in your privacy notice
(Data Protection and Privacy Act, Uganda).
