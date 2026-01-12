// 키워드:카테고리 형식 파싱 (공백 허용: "키워드 : 카테고리" 또는 "키워드:카테고리")
export const parseKeywordWithCategory = (input: string): { keyword: string; category?: string } => {
  const lastColonIndex = input.lastIndexOf(':');
  if (lastColonIndex === -1) {
    return { keyword: input.trim() };
  }

  const keyword = input.slice(0, lastColonIndex).trim();
  const category = input.slice(lastColonIndex + 1).trim();

  // 카테고리가 비어있으면 전체를 키워드로 취급
  if (!category) {
    return { keyword: input.trim() };
  }

  return { keyword, category };
}
