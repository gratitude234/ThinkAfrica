import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let passed = 0;
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`✓ ${label}\n`);
  } else {
    failures.push(detail ? `${label}: ${detail}` : label);
    process.stdout.write(`✗ ${label}\n`);
  }
}
function contains(rel, pattern, label) {
  const source = read(rel);
  check(label, pattern.test(source), `${rel} did not match ${pattern}`);
}
function excludes(rel, pattern, label) {
  const source = read(rel);
  check(label, !pattern.test(source), `${rel} unexpectedly matched ${pattern}`);
}

check('Profile V3 product contract exists', exists('docs/profile-v3-contract.md'));
contains(
  'lib/profileTabs.ts',
  /PUBLIC_PROFILE_TABS\s*=\s*\["overview",\s*"posts",\s*"articles",\s*"about"\]/,
  'Public profile tabs remain Overview → Posts → Articles → About'
);
contains(
  'lib/profileTabs.ts',
  /OWNER_PROFILE_TABS\s*=\s*\["overview",\s*"posts",\s*"articles",\s*"about",\s*"drafts"\]/,
  'Drafts remain owner-only in the tab contract'
);

const profileComponentDir = path.join(root, 'components/profile');
const profileComponentSources = fs.readdirSync(profileComponentDir)
  .filter((name) => /\.(ts|tsx)$/.test(name))
  .map((name) => [name, fs.readFileSync(path.join(profileComponentDir, name), 'utf8')]);
check(
  'Profile components do not query Supabase directly',
  profileComponentSources.every(([, source]) => !/\bsupabase\s*\.\s*from\s*\(/.test(source)),
  'A components/profile file contains a direct .from(...) query'
);

contains(
  'components/profile/ProfileOverview.tsx',
  /Intellectual Record/,
  'Overview keeps the lightweight Intellectual Record'
);
contains(
  'components/profile/ProfileOverview.tsx',
  /Recent Work/,
  'Overview keeps one mixed Recent Work section'
);
excludes(
  'components/profile/ProfileOverview.tsx',
  /Research Notes|Debate Contributions|Peer Reviews|\bCitations\b|\bResponses\b/,
  'Overview does not revive retired public-work domains'
);

check('Full Intellectual Record route exists', exists('app/(main)/[username]/record/page.tsx'));
contains(
  'app/(main)/[username]/record/page.tsx',
  /loadProfileRecordView/,
  'Full record route uses the profile data boundary'
);
contains(
  'components/profile/ProfileHeader.tsx',
  /onError=\{\(\) => setFailedCoverUrl\(profile\.cover_image_url \?\? null\)\}/,
  'Broken cover objects fail closed without a broken banner'
);

contains(
  'lib/profileSettingsData.ts',
  /selectedWorkUnavailable = true/,
  'Edit Profile detects a stale Selected Work pointer'
);
contains(
  'app/(main)/settings/profile/sections/SelectedWorkSection.tsx',
  /no longer published/,
  'Edit Profile explains stale Selected Work and lets the owner clear it'
);

contains(
  'lib/db/profilePage.ts',
  /profile_directory/,
  'Related Thinkers hydrates identity through the safe directory projection'
);
contains(
  'lib/profileViewData.ts',
  /getFeedExcludedUserIds/,
  'Related Thinkers reuses the bounded server-side block exclusion boundary'
);
contains(
  'lib/profileViewData.ts',
  /limit:\s*6[\s\S]*\.slice\(0,\s*3\)/,
  'Related Thinkers fetches a small reserve, filters exclusions, then caps the public list'
);
excludes(
  'lib/db/profilePage.ts',
  /is_blocked_pair|public\.user_blocks as blocked_pair/,
  'Related Thinkers repositories do not fan out per-candidate block queries'
);

contains(
  'supabase/migrations/20261002000100_profile_v3_selected_work.sql',
  /SECURITY INVOKER/,
  'Selected Work mutation stays SECURITY INVOKER'
);
contains(
  'supabase/migrations/20261002000100_profile_v3_selected_work.sql',
  /REVOKE ALL ON FUNCTION public\.set_my_selected_work\(uuid\)[\s\S]*GRANT EXECUTE ON FUNCTION public\.set_my_selected_work\(uuid\)[\s\S]*authenticated/,
  'Selected Work RPC execution is restricted to authenticated callers'
);
contains(
  'supabase/migrations/20261002000100_profile_v3_selected_work.sql',
  /post\.content_kind IN \('post', 'article'\)/,
  'Selected Work accepts only current Post/Article product kinds'
);

const onboardingFiles = [];
const onboardingRoot = path.join(root, 'app/(onboarding)');
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) onboardingFiles.push(fs.readFileSync(full, 'utf8'));
  }
}
walk(onboardingRoot);
const onboardingSource = onboardingFiles.join('\n');
check(
  'Onboarding does not require cover, university or selected work',
  !/cover_image_url|CoverImageUploader|SelectedWork|graduation_year|UniversitySelect/.test(onboardingSource),
  'Onboarding contains a profile-enrichment field that belongs in Edit Profile'
);

contains(
  'components/ui/ProfileGate.tsx',
  /getOnboardingProfileError/,
  'Composer ProfileGate shares onboarding identity validation'
);
excludes(
  'components/ui/ProfileGate.tsx',
  /UniversitySelect|setUniversity/,
  'Composer ProfileGate asks only for essential identity fields'
);

if (failures.length) {
  process.stderr.write(`\nProfile V3 final audit failed: ${failures.length} check(s).\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`\nProfile V3 final audit passed: ${passed} checks.\n`);
