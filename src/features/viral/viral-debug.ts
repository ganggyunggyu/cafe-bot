'use server';

import { promises as fs } from 'fs';
import path from 'path';

const DEBUG_DIR = path.join(process.cwd(), '.viral-debug');

export interface ViralDebugEntry {
  id: string;
  keyword: string;
  prompt: string;
  response: string;
  parsedTitle?: string;
  parsedBody?: string;
  parsedComments?: number;
  parseError?: string;
  createdAt: string;
}

const ensureDebugDir = async () => {
  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export const saveViralDebug = async (entry: Omit<ViralDebugEntry, 'id' | 'createdAt'>): Promise<string> => {
  await ensureDebugDir();

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullEntry: ViralDebugEntry = {
    ...entry,
    id,
    createdAt: new Date().toISOString(),
  };

  const filePath = path.join(DEBUG_DIR, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(fullEntry, null, 2), 'utf-8');

  console.log(`[VIRAL-DEBUG] 저장됨: ${id}`);
  return id;
}

export const getViralDebugList = async (): Promise<ViralDebugEntry[]> => {
  await ensureDebugDir();

  try {
    const files = await fs.readdir(DEBUG_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const entries: ViralDebugEntry[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(DEBUG_DIR, file), 'utf-8');
        entries.push(JSON.parse(content));
      } catch {
        // skip invalid files
      }
    }

    return entries.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export const getViralDebugById = async (id: string): Promise<ViralDebugEntry | null> => {
  await ensureDebugDir();

  try {
    const filePath = path.join(DEBUG_DIR, `${id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export const clearViralDebug = async (): Promise<number> => {
  await ensureDebugDir();

  try {
    const files = await fs.readdir(DEBUG_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      await fs.unlink(path.join(DEBUG_DIR, file));
    }

    return jsonFiles.length;
  } catch {
    return 0;
  }
}
