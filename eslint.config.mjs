import nextVitals from "eslint-config-next/core-web-vitals";

/**
 * Em dashes make product copy read as machine-written, so they are banned from
 * anything that reaches a user. Rewrite instead: two short sentences by default,
 * a colon when the second half labels the first, a comma for a true aside, or
 * "·" as a separator inside badges, option labels and eyebrows.
 *
 * Only string and JSX text nodes are inspected, so comments, JSDoc and docs are
 * untouched. The rare legitimate typographic em dash (an empty-cell marker, a
 * quote attribution) stays, with an eslint-disable-next-line at the site.
 */
const NO_EM_DASH_MESSAGE =
  "Em dash in user-facing copy. Split into two sentences, or use a colon, a comma, or '·'.";

const noEmDashInCopy = [
  { selector: "Literal[value=/—/]", message: NO_EM_DASH_MESSAGE },
  { selector: "JSXText[value=/—/]", message: NO_EM_DASH_MESSAGE },
  { selector: "TemplateElement[value.raw=/—/]", message: NO_EM_DASH_MESSAGE },
];

const eslintConfig = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...noEmDashInCopy],
    },
  },
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
