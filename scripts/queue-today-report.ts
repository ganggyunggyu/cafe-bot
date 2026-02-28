import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379/1', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

type JobSummary = {
  account: string;
  type: string;
  cafe: string;
  articleId?: number;
  subject?: string;
  keyword?: string;
  success: boolean;
  error?: string;
  finishedAt: string;
};

const main = async () => {
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];
  const allQueues = [...queueNames, 'generate'];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const results: JobSummary[] = [];

  for (const queueName of allQueues) {
    try {
      const queue = new Queue(queueName, {
        connection: { host: 'localhost', port: 6379, db: 1 },
      });

      const completed = await queue.getCompleted(0, 500);
      const failed = await queue.getFailed(0, 500);

      for (const job of [...completed, ...failed]) {
        const finishedOn = job.finishedOn || 0;
        if (finishedOn < todayTs) continue;

        const data = job.data as Record<string, unknown>;
        const returnValue = job.returnvalue as Record<string, unknown> | null;
        const isFailed =
          job.failedReason !== undefined && job.failedReason !== null;

        results.push({
          account:
            (data.accountId as string) || queueName.replace('task_', ''),
          type: (data.type as string) || 'generate',
          cafe: (data.cafeId as string) || '',
          articleId: data.articleId as number | undefined,
          subject: (data.subject as string)?.slice(0, 40),
          keyword: data.keyword as string | undefined,
          success: isFailed ? false : ((returnValue?.success as boolean) ?? true),
          error: isFailed
            ? job.failedReason?.slice(0, 80)
            : (returnValue?.error as string)?.slice(0, 80),
          finishedAt: new Date(finishedOn).toLocaleTimeString('ko-KR', {
            hour12: false,
          }),
        });
      }

      await queue.close();
    } catch {
      // skip
    }
  }

  results.sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

  const byType: Record<string, JobSummary[]> = {};
  for (const r of results) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  }

  console.log(
    `\n=== 오늘 큐 완료 현황 (${new Date().toLocaleDateString('ko-KR')}) ===\n`
  );
  console.log(`총 ${results.length}건\n`);

  for (const [type, jobs] of Object.entries(byType)) {
    const success = jobs.filter((j) => j.success).length;
    const fail = jobs.filter((j) => !j.success).length;
    console.log(`\n--- ${type.toUpperCase()} (성공 ${success} / 실패 ${fail}) ---`);

    const byAccount: Record<string, JobSummary[]> = {};
    for (const j of jobs) {
      if (!byAccount[j.account]) byAccount[j.account] = [];
      byAccount[j.account].push(j);
    }

    for (const [account, accountJobs] of Object.entries(byAccount)) {
      const s = accountJobs.filter((j) => j.success).length;
      const f = accountJobs.filter((j) => !j.success).length;
      console.log(`  ${account}: ${s}성공 ${f > 0 ? ` ${f}실패` : ''}`);
      for (const j of accountJobs) {
        const detail =
          j.subject ||
          j.keyword ||
          (j.articleId ? `articleId:${j.articleId}` : '');
        const status = j.success ? '✅' : '❌';
        const errMsg = !j.success && j.error ? ` (${j.error})` : '';
        console.log(`    ${status} ${j.finishedAt} ${detail}${errMsg}`);
      }
    }
  }

  await redis.quit();
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
