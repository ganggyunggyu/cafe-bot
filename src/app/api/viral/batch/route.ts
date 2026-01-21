import { runViralBatch, type ViralBatchInput } from '@/features/viral/viral-batch-job';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const input: ViralBatchInput = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await runViralBatch(input, (progress) => {
          sendProgress({
            type: 'progress',
            ...progress,
          });
        });

        sendProgress({
          type: 'complete',
          result,
        });
      } catch (error) {
        sendProgress({
          type: 'error',
          error: error instanceof Error ? error.message : '알 수 없는 오류',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
