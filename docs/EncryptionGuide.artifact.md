# SmartSchool Elite: PGP Encryption Guide

To achieve military-grade data protection, we recommend implementing **PostgreSQL PGP (Pretty Good Privacy)** encryption for sensitive student and financial data.

## 1. Enable Extension
In your Supabase SQL Editor, enable the `pgcrypto` extension:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## 2. Encrypting Sensitive Columns
Instead of storing scores or private comments in plain text, use `pgp_sym_encrypt`.

### Example: Encrypting a Grade
```sql
INSERT INTO public.results (student_id, exam_id, score_encrypted)
VALUES (
  'student-uuid',
  'exam-uuid',
  pgp_sym_encrypt('95', 'your-secret-key')
);
```

## 3. Decrypting for Authorized Views
Only decrypt data when the user has the correct authorization key.

### Example: Authorized Decryption
```sql
SELECT
  student_id,
  pgp_sym_decrypt(score_encrypted, 'your-secret-key') as score
FROM public.results;
```

## 4. Key Management (Vault)
> [!IMPORTANT]
> Never store the 'your-secret-key' in the frontend code. Use **Supabase Vault** or **Edge Functions** to handle decryption securely on the server-side.

## 5. Implementation Roadmap
1. **Migration**: Move existing data from `score` to `score_encrypted`.
2. **Triggers**: Automate encryption on every Insert/Update.
3. **Views**: Create secure PostgreSQL views that handle the decryption logic based on the user's role.

---
*This guide ensures SmartSchool 6.0 remains the most secure management platform in the region.*
