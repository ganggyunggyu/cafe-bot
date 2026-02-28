# API — External API Clients

## OVERVIEW

External API clients for content generation (Gemini/GPT/Claude), comment generation, image search, and Naver Cafe integration.

## STRUCTURE

```
src/shared/api/
├── content-api.ts          # Main content generation (Gemini/GPT/Claude via external service)
├── comment-gen-api.ts      # Comment/reply generation service
├── gemini-comment-api.ts   # Direct Gemini SDK integration
├── keyword-gen-api.ts      # AI keyword generation
├── google-image-api.ts     # Google image search
├── naver-cafe-api.ts       # Naver OpenAPI for posting
└── naver-comment-api.ts    # Playwright-based comment automation
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Generate post content | `content-api.ts` | `generateContent()`, `generateViralContent()` |
| Generate comments | `comment-gen-api.ts` | `generateComment()`, `generateReply()` |
| Direct Gemini calls | `gemini-comment-api.ts` | Uses `@google/genai` SDK |
| Search images | `google-image-api.ts` | `searchRandomImages()` |
| Post to Naver Cafe | `naver-cafe-api.ts` | OAuth2 Bearer token required |
| Write comments | `naver-comment-api.ts` | Playwright automation, not REST API |
| Generate keywords | `keyword-gen-api.ts` | AI-powered keyword generation |

## CONVENTIONS

### API Client Patterns
- **Base URLs from env**: `process.env.X_API_URL || 'http://localhost:PORT'`
- **Named exports only**: No default exports for API functions
- **Interface-per-call**: `XxxRequest`, `XxxResponse` for each endpoint

### Error Handling
```typescript
// REST APIs: throw on HTTP error
if (!response.ok) {
  const errorBody = await response.text();
  console.error('[MODULE] Error:', response.status, errorBody);
  throw new Error(`Descriptive error: ${response.status}`);
}

// Text normalization pipeline
const normalizeText = (value: string): string => 
  value.replace(/\s+/g, ' ').trim();
```

### Rate Limiting
- **No client-side rate limiting**: Rate limiting handled by queue workers (`shared/lib/queue/`)
- **External service handles**: Content/comment APIs have internal rate limiting
- **Retry logic**: In queue handlers, not API clients
