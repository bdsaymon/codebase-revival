# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Master Gate Invariant**: Subcollections `/users/{userId}/conversations/{conversationId}`, `/users/{userId}/sessions/{sessionId}`, `/users/{userId}/memories/{memoryId}`, and `/users/{userId}/usage/{usageKey}` cannot be created, updated, or read unless the parent `/users/{userId}` document exists and belongs to `request.auth.uid` (or `isAdmin()`). Messages under `/users/{userId}/sessions/{sessionId}/messages/{messageId}` additionally enforce `sessionExists(userId, sessionId)`.
2. **Quota Counter Protection Invariant**: Normal client SDKs are strictly **forbidden** from creating, updating, or deleting `/users/{userId}/usage/{usageKey}` documents. Only `isAdmin()` (or trusted backend enforcement) may modify quota documents, preventing any client-side quota reset, spoofing, or counter manipulation.
3. **Zero-PII Invariant**: No email, phone number, or physical address is stored in `/users/{userId}` or any subcollection.
4. **Temporal & Identity Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`. All `userId` and `sessionId` fields are immutable and must equal their parent path parameters and `request.auth.uid`.
5. **Untrusted Privilege Flag Prevention**: Client-created or updated user documents cannot escalate `testingBypass` or `testingAllowance`; admin/testing authorization is exclusively derived from verified identity (`request.auth.token.email == 'msftashop@gmail.com'` with `email_verified == true`, or `/admins/{uid}` existence).

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth == null` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `auth.uid == 'u1'`, `email_verified == false` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/m1` with `{ userId: 'u2' }` -> `PERMISSION_DENIED`.
4. **Orphaned Subcollection Write**: `auth.uid == 'u1'` attempting `create` on `/users/u1/sessions/s1/messages/msg1` when `/users/u1/sessions/s1` does not exist -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: `auth.uid == 'u1'` attempting `update` on `/users/u1` with `{ displayName: 'Ali', isAdmin: true }` -> `PERMISSION_DENIED`.
6. **Client Quota Creation / Tampering**: Normal user `auth.uid == 'u1'` attempting `create` or `update` on `/users/u1/usage/2026-11-12_smfta-max` -> `PERMISSION_DENIED`.
7. **Self-Granted Testing Bypass**: Normal user `auth.uid == 'u1'` attempting `create` on `/users/u1` with `{ testingBypass: true, testingAllowance: 9999 }` -> `PERMISSION_DENIED`.
8. **Cross-User Session Read**: `auth.uid == 'u2'` attempting `get` or `list` on `/users/u1/sessions/s1/messages` -> `PERMISSION_DENIED`.
9. **Resource Poisoning (ID > 128 chars or invalid regex)**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/bad$id!` -> `PERMISSION_DENIED`.
10. **Value Poisoning (Oversized String)**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/m1` with `fact` length > 1000 -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/m1` with `createdAt != request.time` -> `PERMISSION_DENIED`.
12. **Privilege Escalation on System Config**: Non-admin `auth.uid == 'u1'` attempting `update` on `/system_configs/v2_limits` -> `PERMISSION_DENIED`.
