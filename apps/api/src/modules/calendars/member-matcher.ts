import type { User } from "@familywall/shared";

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a function that finds which members an event title mentions.
 * Each member is recognised by display name and keywords, as whole words,
 * ignoring case and accents ("Nicolò" matches "nicolo"). Results follow the order in the title.
 */
export const buildMemberMatcher = (members: User[]): ((title: string) => string[]) => {
  const patterns = members
    .filter((member) => member.role !== "Kiosk" && !member.disabled)
    .map((member) => {
      const words = [member.displayName, ...member.keywords].map((word) => normalize(word.trim())).filter((word) => word.length >= 2);
      if (words.length === 0) {
        return null;
      }
      const alternatives = [...new Set(words)].map(escapeRegExp).join("|");
      return { id: member.id, regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "u") };
    })
    .filter((pattern): pattern is { id: string; regex: RegExp } => pattern !== null);

  return (title: string) => {
    const text = normalize(title);
    return patterns
      .map((pattern) => ({ id: pattern.id, index: text.search(pattern.regex) }))
      .filter((match) => match.index >= 0)
      .sort((left, right) => left.index - right.index)
      .map((match) => match.id);
  };
};
