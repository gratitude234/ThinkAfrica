// Authoritative list of African university email domains.
// Add new domains here - the verification trigger reads this via the DB function.
// Keep entries lowercase; the DB function also lowercases before matching.

export const AFRICAN_UNIVERSITY_DOMAINS: ReadonlySet<string> = new Set([
  // Nigeria
  "unilag.edu.ng",
  "oauife.edu.ng",
  "abu.edu.ng",
  "unn.edu.ng",
  "uniben.edu.ng",
  "ui.edu.ng",
  "futa.edu.ng",
  "lautech.edu.ng",
  "unilorin.edu.ng",
  "fuoye.edu.ng",
  "jabu.edu.ng",
  "mouau.edu.ng",
  "aue.edu.ng",
  "covenant.edu.ng",
  "babcock.edu.ng",
  "aun.edu.ng",
  "run.edu.ng",
  "bells.edu.ng",
  "afe.edu.ng",
  // Ghana
  "ug.edu.gh",
  "knust.edu.gh",
  "uds.edu.gh",
  "ucc.edu.gh",
  "uhas.edu.gh",
  "upsa.edu.gh",
  "gimpa.edu.gh",
  // South Africa
  "uct.ac.za",
  "wits.ac.za",
  "sun.ac.za",
  "up.ac.za",
  "uj.ac.za",
  "ukzn.ac.za",
  "ru.ac.za",
  "nwu.ac.za",
  "ufs.ac.za",
  "uwc.ac.za",
  "unisa.ac.za",
  "cput.ac.za",
  "dut.ac.za",
  "tut.ac.za",
  "cut.ac.za",
  // Kenya
  "uonbi.ac.ke",
  "ku.ac.ke",
  "jkuat.ac.ke",
  "egerton.ac.ke",
  "strathmore.edu",
  "usiu.ac.ke",
  // Uganda
  "mak.ac.ug",
  "must.ac.ug",
  "iuiu.ac.ug",
  "kyu.ac.ug",
  // Tanzania
  "udsm.ac.tz",
  "ardhi.ac.tz",
  "sua.ac.tz",
  "out.ac.tz",
  // Ethiopia
  "aau.edu.et",
  "ju.edu.et",
  "hu.edu.et",
  // Rwanda
  "ur.ac.rw",
  "ines.ac.rw",
  // Cote d'Ivoire
  "univ-fhb.edu.ci",
  "inphb.edu.ci",
  // Senegal
  "ucad.edu.sn",
  "ugb.edu.sn",
  // Cameroon
  "univ-yaounde1.cm",
  "univ-douala.cm",
  // Generic African academic TLDs (catch-all for unlisted institutions)
  // Kept broad because we check for country TLD patterns too
]);

export function isUniversityEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) return false;
  if (AFRICAN_UNIVERSITY_DOMAINS.has(domain)) return true;

  return Array.from(AFRICAN_UNIVERSITY_DOMAINS).some(
    (listedDomain) => domain === listedDomain || domain.endsWith(`.${listedDomain}`)
  );
}
