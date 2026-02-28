# MODELS — Mongoose Schemas

Mongoose models for cafe-bot viral automation platform.

## STRUCTURE

```
src/shared/models/
├── index.ts              # Barrel export (import from here)
├── account.ts            # NaverAccount (credentials, activity hours, limits)
├── cafe.ts               # CafeConfig (menus, roles, posting rules)
├── published-article.ts  # Published posts + comment/reply tracking
├── modified-article.ts   # Modified post versions
├── viral-response.ts     # AI-generated viral content cache
├── daily-post-count.ts   # Per-account daily posting limits
├── daily-activity.ts     # Activity log aggregation
├── batch-job-log.ts      # Batch processing job records
├── queue-settings.ts     # BullMQ queue configuration
├── user.ts               # Application users
```

## WHERE TO LOOK

| Task | Model | Key Export |
|------|-------|------------|
| Check if already commented | `published-article.ts` | `hasCommented(cafeId, articleId, accountId)` |
| Add comment/reply record | `published-article.ts` | `addCommentToArticle(...)` |
| Get today's post count | `daily-post-count.ts` | `getTodayPostCount(accountId, cafeId)` |
| Increment post counter | `daily-post-count.ts` | `incrementTodayPostCount(...)` |
| Check daily limit | `daily-post-count.ts` | `canPostToday(accountId, cafeId, limit)` |
| Save AI viral response | `viral-response.ts` | `saveViralResponse(entry)` |
| Get viral response stats | `viral-response.ts` | `getViralResponseStats(userId?)` |
| Account comment stats | `published-article.ts` | `getAccountCommentStats(accountId)` |
| Find article by keyword | `published-article.ts` | `getArticleIdByKeyword(cafeId, keyword)` |

## CONVENTIONS

### Model Pattern
```typescript
// Export Model + Interface + helpers
export const ModelName: Model<IInterface> =
  mongoose.models.Name || mongoose.model<IInterface>('Name', Schema);
export type IInterface = Document & { ... };
export const helperFunction = async (...) => { ... };
```

### Subdocuments
- Use `{ _id: false }` for embedded schemas (comments, activity hours)
- Keep subdocument interfaces exportable for reuse

### Indexes
- Always add indexes on query fields (`userId`, `cafeId`, `accountId`)
- Compound unique indexes for composite keys (e.g., `userId + accountId`)
- Add `{ timestamps: true }` to all schemas

### Date Handling
- KST timezone for `daily-post-count.ts` (UTC+9, `YYYY-MM-DD` format)
- `timestamps: true` handles `createdAt`/`updatedAt` automatically

### Import From
```typescript
// Always use barrel export
import { Account, PublishedArticle, getTodayPostCount } from '@/shared/models';
```
