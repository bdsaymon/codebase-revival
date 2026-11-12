# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Master Gate Invariant**: Subcollections `/users/{userId}/conversations/{conversationId}`, `/users/{userId}/memories/{memoryId}`, and `/users/{userId}/usage/{usageKey}` cannot be created, updated, or read unless the parent `/users/{userId}` document exists and belongs to `request.auth.uid` (or `isAdmin()`).
2. **Quota Monotonicity Invariant**: A normal user cannot decrement their `count` in `/users/{userId}/usage/{usageKey}` during an update (`incoming().count == existing().count + 1` and `incoming().count <= existing().dailyLimit`), nor can they modify `dailyLimit` or `dateRiyadh` after creation unless they are `isAdmin()`.
3. **Zero-PII Invariant**: No email, phone number, or physical address is stored in `/users/{userId}` or any subcollection.
4. **Temporal & Identity Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`. All `userId` fields are immutable and must equal `request.auth.uid`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth == null` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `auth.uid == 'u1'`, `email_verified == false` attempting `create` on `/users/u1` -> `PERMISSION_DENIED`.
3. **Identity Spoofing**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/m1` with `{ userId: 'u2' }` -> `PERMISSION_DENIED`.
4. **Orphaned Subcollection Write**: `auth.uid == 'u1'` attempting `create` on `/users/u1/conversations/c1` when `/users/u1` does not exist -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: `auth.uid == 'u1'` attempting `update` on `/users/u1` with `{ displayName: 'Ali', isAdmin: true }` -> `PERMISSION_DENIED`.
6. **Quota Reset / Tampering Attack**: `auth.uid == 'u1'` attempting `update` on `/users/u1/usage/2026-11-12_smfta-max` with `count: 0` when `existing().count == 15` -> `PERMISSION_DENIED`.
7. **Quota Limit Escalation**: `auth.uid == 'u1'` attempting `update` on `/users/u1/usage/2026-11-12_smfta-max` with `dailyLimit: 9999` -> `PERMISSION_DENIED`.
8. **Quota Exceeded Bypass**: `auth.uid == 'u1'` attempting `update` on `/users/u1/usage/2026-11-12_smfta-max` with `count: 16` when `dailyLimit == 15` -> `PERMISSION_DENIED`.
9. **Resource Poisoning (ID > 128 chars or invalid regex)**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/bad$id!` -> `PERMISSION_DENIED`.
10. **Value Poisoning (Oversized String)**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/m1` with `fact` length > 1000 -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: `auth.uid == 'u1'` attempting `create` on `/users/u1/memories/m1` with `createdAt != request.time` -> `PERMISSION_DENIED`.
12. **Privilege Escalation on System Config**: Non-admin `auth.uid == 'u1'` attempting `update` on `/system_configs/v2_limits` -> `PERMISSION_DENIED`.
