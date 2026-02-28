# ENTITIES — 3-Layer Entity Pattern

**Generated:** 2026-02-26

## OVERVIEW

FSD의 entities 레이어. 각 엔티티는 `model/` (타입/상태) + `api/` (server actions) + `index.ts` (barrel) 3계층 구조.

## STRUCTURE

```
entities/
├── account/               # NaverAccount 엔티티
│   ├── model.ts          # 타입 정의 (AccountData)
│   ├── api/
│   │   └── index.ts      # Server actions (CRUD)
│   └── index.ts          # Public exports
├── cafe/                  # CafeConfig 엔티티
│   ├── model.ts          # 타입 정의 (CafeData)
│   ├── api/
│   │   └── index.ts      # Server actions (CRUD)
│   └── index.ts
├── queue/                 # BullMQ 큐 상태
│   ├── model.ts          # QueueOverview, JobDetail 타입
│   ├── api/
│   │   └── index.ts      # 큰 조회/관리 actions
│   └── index.ts
└── store/                 # Jotai atoms (클리이언트 상태)
    ├── post-options.ts   # 발행 옵션 atom
    ├── cafes.ts          # 카페 목록 atom
    └── index.ts
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 계정 타입 | `account/model.ts` | `AccountData`, `AccountRole` |
| 계정 CRUD | `account/api/index.ts` | `addAccountAction`, `updateAccountAction` |
| 카페 타입 | `cafe/model.ts` | `CafeData`, `CategoryMapping` |
| 카페 CRUD | `cafe/api/index.ts` | `addCafeAction`, `removeCafeAction` |
| 큐 상태 타입 | `queue/model.ts` | `QueueOverview`, `JobDetail` |
| 큐 조회 | `queue/api/index.ts` | `getAllQueueStatus`, `getDetailedJobs` |
| 발행 옵션 상태 | `store/post-options.ts` | Jotai atom |
| 카페 목록 상태 | `store/cafes.ts` | Jotai atom |

## CONVENTIONS

### 3-Layer Pattern
```
entity-name/
├── model.ts              # Types, interfaces, enums
├── api/
│   └── index.ts          # Server actions only
└── index.ts              # Barrel: export * from './model' + './api'
```

### Model Pattern
```typescript
// model.ts
export interface EntityData {
  id: string;
  // ...fields
}

export type EntityRole = 'admin' | 'user';
```

### API Pattern
```typescript
// api/index.ts
'use server';

export const createEntityAction = async (data: EntityData) => {
  // ...
  return { success: true, data: result };
};
```

### Barrel Pattern
```typescript
// index.ts
export * from './model';
export * from './api';
```

## ANTI-PATTERNS

- **Model에 비즈니스 로직**: 순수 타입/인터페이스만
- **API에서 UI 직접 조작**: Server action은 데이터만 반환
- **Store에서 server-only import**: store/는 client-only

## NOTES

- `features/accounts/actions.ts`가 entities를 facade로 감쌈
- Store atoms는 Jotai 사용, localStorage persist 옵션 있음
- Queue entity는 BullMQ 직접 조회 (Redis)
