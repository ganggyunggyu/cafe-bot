const LINTABLE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;
const IGNORED_PREFIXES = ["coverage/", ".next/", "build/", "out/", "node_modules/"];

export const normalizeLintableFiles = (files) => {
  return [...new Set(files)]
    .map((file) => file.trim())
    .filter((file) => file.length > 0)
    .filter((file) => LINTABLE_FILE_PATTERN.test(file))
    .filter((file) => !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix)))
    .sort();
};

export const getDiffTargets = (baseRef) => {
  if (baseRef) {
    return [[
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      `${baseRef}...HEAD`,
    ]];
  }

  return [
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    ["diff", "--name-only", "--cached", "--diff-filter=ACMR"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
};
