'use server';

import { connectDB } from '@/shared/lib/mongodb';
import {
  saveViralResponse,
  getViralResponseList,
  getViralResponseById,
  clearViralResponses,
  type IViralResponse,
} from '@/shared/models';
import { getCurrentUserId } from '@/shared/config/user';

export interface ViralDebugEntry {
  id: string;
  keyword: string;
  prompt: string;
  response: string;
  parsedTitle?: string;
  parsedBody?: string;
  parsedComments?: number;
  parseError?: string;
  cafeId?: string;
  contentStyle?: string;
  writerPersona?: string;
  createdAt: string;
}

interface SaveDebugInput {
  keyword: string;
  prompt: string;
  response: string;
  parsedTitle?: string;
  parsedBody?: string;
  parsedComments?: number;
  parseError?: string;
  cafeId?: string;
  contentStyle?: string;
  writerPersona?: string;
}

const toDebugEntry = (doc: IViralResponse): ViralDebugEntry => ({
  id: (doc._id as unknown as { toString(): string }).toString(),
  keyword: doc.keyword,
  prompt: doc.prompt,
  response: doc.response,
  parsedTitle: doc.parsedTitle,
  parsedBody: doc.parsedBody,
  parsedComments: doc.parsedComments,
  parseError: doc.parseError,
  cafeId: doc.cafeId,
  contentStyle: doc.contentStyle,
  writerPersona: doc.writerPersona,
  createdAt: doc.createdAt.toISOString(),
});

export const saveViralDebug = async (entry: SaveDebugInput): Promise<string> => {
  await connectDB();
  const userId = await getCurrentUserId();

  return saveViralResponse({
    userId,
    keyword: entry.keyword,
    prompt: entry.prompt,
    response: entry.response,
    parsedTitle: entry.parsedTitle,
    parsedBody: entry.parsedBody,
    parsedComments: entry.parsedComments,
    parseError: entry.parseError,
    cafeId: entry.cafeId,
    contentStyle: entry.contentStyle,
    writerPersona: entry.writerPersona,
  });
};

export const getViralDebugList = async (keyword?: string): Promise<ViralDebugEntry[]> => {
  await connectDB();
  const userId = await getCurrentUserId();

  const docs = await getViralResponseList({
    userId,
    keyword,
    limit: 100,
  });

  return docs.map(toDebugEntry);
};

export const getViralDebugById = async (id: string): Promise<ViralDebugEntry | null> => {
  await connectDB();

  const doc = await getViralResponseById(id);
  if (!doc) return null;

  return toDebugEntry(doc);
};

export const clearViralDebug = async (): Promise<number> => {
  await connectDB();
  const userId = await getCurrentUserId();

  return clearViralResponses({ userId });
};
