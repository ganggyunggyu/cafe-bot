import { PublishedArticle, type IPublishedArticle } from '@/shared/models';
import type { SortOrder } from './modify-batch-job';

export interface QueryFilter {
  cafeId: string;
  status: string;
  publishedAt?: { $gte: Date };
}

export const buildBaseFilter = (cafeId: string, daysLimit?: number): QueryFilter => {
  const baseFilter: QueryFilter = { cafeId, status: 'published' };
  if (daysLimit) {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysLimit);
    baseFilter.publishedAt = { $gte: limitDate };
    console.log(`[MODIFY BATCH] ${daysLimit}일 이내 원고만 조회 (${limitDate.toISOString()} 이후)`);
  }
  return baseFilter;
}

export const fetchArticlesToModify = async (
  sortOrder: SortOrder,
  limit: number,
  baseFilter: QueryFilter
): Promise<IPublishedArticle[]> => {
  if (sortOrder === 'random') {
    return PublishedArticle.aggregate([
      { $match: baseFilter },
      { $sample: { size: limit } },
    ]);
  }

  const sortDirection = sortOrder === 'oldest' ? 1 : -1;
  return PublishedArticle.find(baseFilter).sort({ publishedAt: sortDirection }).limit(limit);
}
