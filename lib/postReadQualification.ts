/**
 * What counts as a qualified read of a publication: long enough on the page
 * and far enough down it. The reader's browser uses the thresholds to decide
 * when to report a read, and the engagement route checks the same rule
 * against the publication's authoritative word count before recording it.
 *
 * A short piece (600 words or fewer) needs 15 active seconds and half the
 * page; anything longer needs 30 seconds and 60 percent.
 */
export function qualifiedReadThresholds(wordCount: number) {
  return wordCount <= 600
    ? { activeSeconds: 15, scrollDepth: 50 }
    : { activeSeconds: 30, scrollDepth: 60 };
}

export function isQualifiedPublicationRead(input: {
  wordCount: number;
  activeSeconds: number | null;
  scrollDepth: number | null;
}) {
  const threshold = qualifiedReadThresholds(input.wordCount);
  return (
    input.activeSeconds !== null &&
    input.scrollDepth !== null &&
    input.activeSeconds >= threshold.activeSeconds &&
    input.scrollDepth >= threshold.scrollDepth
  );
}
