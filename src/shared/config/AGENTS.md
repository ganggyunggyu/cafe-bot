# CONFIG — DB-backed Configuration

MongoDB-backed data sources. Replaces legacy JSON-based `account-manager.ts`.

## STRUCTURE

```
accounts.ts       # NaverAccount queries (getAllAccounts, getWriterAccounts, getCommenterAccounts)
cafes.ts          # CafeConfig queries (getAllCafes, getDefaultCafe)
user.ts           # Cookie-based current user (getCurrentUserId)
user-profile.ts   # Per-user feature flags (keyword prompt profile, viral style)
```

## WHERE TO LOOK

| Need | Use This | Avoid |
|------|----------|-------|
| Load accounts for worker | `getAllAccounts()` in `accounts.ts` | `account-manager.ts` |
| Load writer-only accounts | `getWriterAccounts()` | `NAVER_ACCOUNTS` constant |
| Load commenter accounts | `getCommenterAccounts()` | - |
| Get main account | `getMainAccount()` | Manual filter on JSON |
| Load cafes for user | `getAllCafes()` | `CAFE_LIST` constant |
| Get current userId | `getCurrentUserId()` | Direct cookie read |
| Per-user prompt style | `getKeywordPromptProfileForLoginId()` | Hardcoded logic |

## CONVENTIONS

**Always async**: All query functions return `Promise<T>`. Callers must await.

**Auto userId resolution**: Functions accept optional `userId` param. If omitted, reads from cookie via `getCurrentUserId()`.

**Empty array fallback**: On DB error, returns `[]` (accounts) or undefined (single item) — never throws.

**Role-based filtering**: Accounts have `role: 'writer' \| 'commenter'`. Use `getWriterAccounts()` / `getCommenterAccounts()` instead of filtering manually.

**⛔ DO NOT USE**: `shared/lib/account-manager.ts` reads static JSON. All new code MUST use `shared/config/accounts.ts` for DB-backed data.
