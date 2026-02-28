# ACCOUNTS — Account & Cafe Management UI

## OVERVIEW

Account and cafe management UI layer acting as a facade over entities/account and entities/cafe. Provides forms for CRUD operations plus configuration for activity hours, daily limits, personas, and config migration.

## STRUCTURE

```
features/accounts/
├── account-manager-ui.tsx    # Main account management UI (559 lines)
├── cafe-manager-ui.tsx       # Cafe management UI
├── actions.ts                # Re-exports from entities (facade pattern)
├── migrate-action.ts         # Config to DB migration server action
└── index.ts                  # Public exports (AccountManagerUI, CafeManagerUI)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Account CRUD | `entities/account/api/index.ts` | Server actions with userId scoping |
| Cafe CRUD | `entities/cafe/api/index.ts` | Server actions with category mapping |
| Types | `entities/account/model.ts`, `entities/cafe/model.ts` | AccountData, CafeData interfaces |
| Config migration | `migrate-action.ts` | Imports from shared/config/, migrates to MongoDB |
| Persona options | `account-manager-ui.tsx:17` | PERSONA_OPTIONS array (100+ personas) |

## CONVENTIONS

### Facade Pattern
- `features/accounts/actions.ts` re-exports from entities — never implements directly
- UI imports from `./actions`, not from entities

### Account Settings Model
- `activityHours`: `{ start: number; end: number }` — 24h format
- `restDays`: `number[]` — 0=Sunday, 6=Saturday
- `dailyPostLimit`: `number` — per day cap
- `personaId`: `string` — references PERSONA_OPTIONS
- `isMain`: `boolean` — primary account flag

### Cafe Settings Model
- `cafeId`, `menuId`: string identifiers
- `categories`: `string[]` — content categories
- `categoryMenuIds`: `Record<string, string>` — category → menu mapping
- `isDefault`: `boolean` — default cafe for posting
