import type { ViralCommentItem } from './types';

export const MAX_VIRAL_MAIN_COMMENTS = 10;
export const MAX_VIRAL_COMMENT_JOBS = 18;

export const limitViralCommentItems = (
  comments: ViralCommentItem[],
  maxMainComments: number = MAX_VIRAL_MAIN_COMMENTS,
  maxTotalJobs: number = MAX_VIRAL_COMMENT_JOBS,
): ViralCommentItem[] => {
  const allowedParents = new Set<number>();
  const limited: ViralCommentItem[] = [];
  let mainCount = 0;

  for (const comment of comments) {
    if (limited.length >= maxTotalJobs) break;

    if (comment.type === 'comment') {
      if (mainCount >= maxMainComments) continue;
      allowedParents.add(comment.index);
      limited.push(comment);
      mainCount++;
      continue;
    }

    if (comment.parentIndex !== undefined && allowedParents.has(comment.parentIndex)) {
      limited.push(comment);
    }
  }

  return limited;
};
