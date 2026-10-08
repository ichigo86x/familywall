import { existsSync } from "node:fs";

/**
 * Splits a command setting such as `python3 -m radicale` into executable and arguments.
 * Double quotes keep a path with spaces together (`"C:\Program Files\Python\python.exe" -m radicale`),
 * and a setting that is just the path of an existing file is used as is.
 */
export const splitCommand = (command: string): string[] => {
  const trimmed = command.trim();
  if (trimmed === "") {
    return [];
  }
  if (existsSync(trimmed)) {
    return [trimmed];
  }
  return [...trimmed.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]!);
};

/** Quotes a path for a command setting when it contains spaces. */
export const quoteCommandPart = (part: string): string => (/\s/.test(part) ? `"${part}"` : part);
