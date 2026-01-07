'use client';

import { useState, useTransition } from 'react';
import { autoPostWithComments, addCommentsToArticle } from './auto-post-actions';
import {
  AutoPostForm,
  type AutoPostInputState,
  type AutoPostMode,
  type AutoPostResultState,
} from './auto-post-form';

export function AutoPostUI() {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<AutoPostMode>('new');

  // 새 글 작성 모드
  const [postInput, setPostInput] = useState<AutoPostInputState>({
    service: '',
    keyword: '',
    ref: '',
  });

  // 기존 글에 댓글 모드
  const [articleId, setArticleId] = useState('');

  // 댓글 목록
  const [comments, setComments] = useState<string[]>(['']);

  // 결과
  const [result, setResult] = useState<AutoPostResultState | null>(null);

  const addCommentField = () => {
    setComments([...comments, '']);
  };

  const removeCommentField = (index: number) => {
    setComments(comments.filter((_, i) => i !== index));
  };

  const updateComment = (index: number, value: string) => {
    const updated = [...comments];
    updated[index] = value;
    setComments(updated);
  };

  const handleSubmit = () => {
    const validComments = comments.filter((c) => c.trim());

    if (mode === 'new') {
      const { service, keyword, ref } = postInput;

      if (!service || !keyword) {
        setResult({ type: 'error', message: 'service와 keyword를 입력해줘.' });
        return;
      }

      startTransition(async () => {
        setResult({ type: 'success', message: '글 작성 중...' });

        const res = await autoPostWithComments({
          service,
          keyword,
          ref: ref || undefined,
          comments: validComments,
        });

        if (res.success) {
          const details = res.commentResults?.map(
            (r) => `${r.accountId}: ${r.success ? '성공' : r.error}`
          );

          setResult({
            type: 'success',
            message: `글 작성 완료! (ID: ${res.articleId})`,
            details,
          });
        } else {
          setResult({ type: 'error', message: res.error || '실패' });
        }
      });
    } else {
      if (!articleId) {
        setResult({ type: 'error', message: 'articleId를 입력해줘.' });
        return;
      }

      startTransition(async () => {
        setResult({ type: 'success', message: '댓글 작성 중...' });

        const res = await addCommentsToArticle({
          articleId: parseInt(articleId, 10),
          comments: validComments,
        });

        if (res.success) {
          const details = res.results?.map(
            (r) => `${r.accountId}: ${r.success ? '성공' : r.error}`
          );

          setResult({
            type: 'success',
            message: '댓글 작성 완료!',
            details,
          });
        } else {
          setResult({ type: 'error', message: res.error || '실패' });
        }
      });
    }
  };

  return (
    <AutoPostForm
      mode={mode}
      postInput={postInput}
      articleId={articleId}
      comments={comments}
      result={result}
      isPending={isPending}
      onModeChange={setMode}
      onPostInputChange={setPostInput}
      onArticleIdChange={setArticleId}
      onAddComment={addCommentField}
      onRemoveComment={removeCommentField}
      onUpdateComment={updateComment}
      onSubmit={handleSubmit}
    />
  );
}
