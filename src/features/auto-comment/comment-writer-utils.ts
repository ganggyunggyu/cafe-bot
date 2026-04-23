const normalizeNicknameForComparison = (value: string | null | undefined): string => {
  return (value ?? '').replace(/\s+/g, '').trim();
};

export const isNicknameEquivalent = (
  actualNickname: string | null | undefined,
  expectedNickname: string | null | undefined
): boolean => {
  const normalizedActual = normalizeNicknameForComparison(actualNickname);
  const normalizedExpected = normalizeNicknameForComparison(expectedNickname);

  if (!normalizedActual || !normalizedExpected) return false;

  return (
    normalizedActual === normalizedExpected ||
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  );
};
