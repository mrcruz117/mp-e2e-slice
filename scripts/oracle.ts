// The oracle's toolchain: vendor fixtures from feedparser, derive the
// expectations file from them, and prove both still match upstream.
//
// Nothing here interprets a fixture. The expectations file is a transcription of
// the `Expect:` comment feedparser ships inside each fixture, and `derive
// --check` fails if the committed transcription and the fixtures disagree. That
// is what replaces the hand-translation ADR-0002 describes, and it closes the
// risk that ADR names: a translation error weakening the oracle silently.
//
//   node scripts/oracle.ts vendor [--upstream <dir>]
//   node scripts/oracle.ts derive [--check]
//   node scripts/oracle.ts upstream [--upstream <dir>]

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_REPO = "https://github.com/kurtmckee/feedparser.git";

/**
 * feedparser's `main` at the time the oracle was vendored. Moving this pin is a
 * deliberate act: it changes what grades every later ticket.
 */
const UPSTREAM_PIN = "06b8f292e66676aaab0e9824ba65e2469616e600";

/** RSS 2.0 and Atom 1.0 only — the two formats this reader claims to support. */
const CORPUS_DIRS = ["wellformed/rss", "wellformed/atom10"];

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const VENDOR_DIR = join(REPO_ROOT, "tests/fixtures");
const EXPECTATIONS_PATH = join(VENDOR_DIR, "expectations.json");

/** Mirrors `desc_re` in feedparser's own `tests/helpers.py`. */
const DESCRIPTION_AND_EXPECT = /Description:\s*(.*?)\s*Expect:\s*(.*)\s*-->/;

/**
 * The subset of `Expect:` expressions this oracle accepts: one comparison,
 * against one top-level field of the feed or of the first entry. Anything else
 * — nested targets like `feed['image']['link']`, multi-clause conjunctions,
 * chained comparisons — is out of subset and is not vendored at all, rather than
 * being interpreted by hand.
 */
const ACCEPTED_TARGET =
  /^(?:not bozo and )?(feed|entries\[0\])\['(title|link|guid|id|published|published_parsed|updated|updated_parsed)'\] == (.+)$/;

// No escape sequence is accepted in either quoting style, so these cannot
// disagree with Python about what the literal means.
const SINGLE_QUOTED = /^'([^'\\]*)'$/;
const DOUBLE_QUOTED = /^"([^"\\]*)"$/;
const INT_TUPLE = /^\(\s*(-?\d+(?:\s*,\s*-?\d+)*)\s*\)$/;

export interface Expectation {
  /** Path within `tests/fixtures/`, e.g. `wellformed/rss/item_title.xml`. */
  file: string;
  /** feedparser's own description of what the fixture tests. */
  description: string;
  /** The `Expect:` expression, verbatim, so the transcription can be audited. */
  expect: string;
  scope: "feed" | "item";
  /** Present only for item scope; every accepted expression targets entry 0. */
  index?: number;
  /** feedparser's field name, untranslated. Mapping it is the reader's job. */
  field: string;
  value: string | number[];
}

function parsePythonLiteral(text: string): string | number[] | undefined {
  const single = SINGLE_QUOTED.exec(text);
  if (single?.[1] !== undefined) return single[1];
  const double = DOUBLE_QUOTED.exec(text);
  if (double?.[1] !== undefined) return double[1];
  const tuple = INT_TUPLE.exec(text);
  if (tuple?.[1] !== undefined) {
    return tuple[1].split(",").map((part) => Number(part.trim()));
  }
  return undefined;
}

/**
 * Transcribe one fixture's `Expect:` comment, or return undefined if it falls
 * outside the accepted subset.
 */
export function transcribe(file: string, xml: string): Expectation | undefined {
  const comment = DESCRIPTION_AND_EXPECT.exec(xml);
  const description = comment?.[1]?.trim();
  const expect = comment?.[2]?.trim();
  if (description === undefined || expect === undefined) return undefined;

  const target = ACCEPTED_TARGET.exec(expect);
  const scope = target?.[1];
  const field = target?.[2];
  const literal = target?.[3];
  if (scope === undefined || field === undefined || literal === undefined) {
    return undefined;
  }
  // A chained comparison would otherwise be read as a comparison to a literal.
  if (literal.includes("==")) return undefined;

  const value = parsePythonLiteral(literal);
  if (value === undefined) return undefined;

  return scope === "feed"
    ? { file, description, expect, scope: "feed", field, value }
    : { file, description, expect, scope: "item", index: 0, field, value };
}

function readFixture(path: string): string {
  // Fixtures in these two directories are UTF-8; a stray byte order mark would
  // otherwise sit in front of the comment and defeat the regex.
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

/**
 * Every fixture the accepted subset covers, sorted by path. `corpusRoot` maps a
 * corpus directory to where it actually lives, which differs between an upstream
 * checkout and the vendored copy.
 */
function select(corpusRoot: (dir: string) => string): Expectation[] {
  const selected: Expectation[] = [];
  for (const dir of CORPUS_DIRS) {
    const absolute = corpusRoot(dir);
    for (const name of readdirSync(absolute).sort()) {
      if (!name.endsWith(".xml")) continue;
      const expectation = transcribe(
        `${dir}/${name}`,
        readFixture(join(absolute, name)),
      );
      if (expectation) selected.push(expectation);
    }
  }
  return selected.sort((a, b) => a.file.localeCompare(b.file));
}

const inUpstream = (root: string) => (dir: string) => join(root, "tests", dir);
const inVendor = (dir: string) => join(VENDOR_DIR, dir);

export function renderExpectations(expectations: Expectation[]): string {
  return `${JSON.stringify(
    {
      upstream: { repository: UPSTREAM_REPO, commit: UPSTREAM_PIN },
      generatedBy: "node scripts/oracle.ts derive",
      expectations,
    },
    null,
    2,
  )}\n`;
}

/** The expectations the vendored fixtures assert, recomputed from their XML. */
export function deriveFromVendoredFixtures(): string {
  return renderExpectations(select(inVendor));
}

function withUpstream<T>(
  provided: string | undefined,
  use: (root: string) => T,
): T {
  if (provided) return use(provided);
  const scratch = mkdtempSync(join(tmpdir(), "feedparser-"));
  try {
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", scratch, ...args], { stdio: "inherit" });
    git("init", "--quiet");
    git("remote", "add", "origin", UPSTREAM_REPO);
    git("fetch", "--quiet", "--depth", "1", "origin", UPSTREAM_PIN);
    git("checkout", "--quiet", "FETCH_HEAD");
    return use(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const VENDOR_README = `# Vendored oracle

Feed XML fixtures copied verbatim from
[kurtmckee/feedparser](https://github.com/kurtmckee/feedparser) at commit
\`${UPSTREAM_PIN}\`, together with \`expectations.json\` derived from them.
feedparser is BSD-licensed; its licence is next to this file as \`LICENSE\`, and
the fixtures remain the work of the feedparser contributors.

**This directory is read-only.** It grades the code in this repository, so
nothing in this repository may edit it. Two checks enforce that: \`oracle-guard\`
(hosted in a separate repository, fails any pull request touching this path) and
\`oracle-upstream\` (re-downloads the corpus at the pinned commit and diffs).

Only the fixtures whose \`Expect:\` comment falls inside a mechanically
transcribable subset are vendored — one comparison against one top-level field of
\`feed\` or \`entries[0]\`. \`expectations.json\` is generated from those comments
by \`node scripts/oracle.ts derive\` and re-derived on every test run, so it
cannot drift from the fixtures. Field names in it are feedparser's, untranslated.

See \`docs/adr/0002-oracle-vendored-from-feedparser-and-externally-guarded.md\`.
`;

function vendor(upstreamDir: string | undefined): void {
  withUpstream(upstreamDir, (root) => {
    const selected = select(inUpstream(root));

    rmSync(VENDOR_DIR, { recursive: true, force: true });
    for (const dir of CORPUS_DIRS) {
      mkdirSync(join(VENDOR_DIR, dir), { recursive: true });
    }

    for (const expectation of selected) {
      copyFileSync(
        join(root, "tests", expectation.file),
        join(VENDOR_DIR, expectation.file),
      );
    }
    copyFileSync(join(root, "LICENSE"), join(VENDOR_DIR, "LICENSE"));
    writeFileSync(join(VENDOR_DIR, "README.md"), VENDOR_README);
    writeFileSync(EXPECTATIONS_PATH, renderExpectations(selected));

    process.stdout.write(
      `Vendored ${String(selected.length)} fixtures from ${UPSTREAM_PIN}.\n`,
    );
  });
}

function derive(check: boolean): void {
  const rendered = deriveFromVendoredFixtures();
  if (!check) {
    writeFileSync(EXPECTATIONS_PATH, rendered);
    process.stdout.write("Wrote tests/fixtures/expectations.json.\n");
    return;
  }
  if (readFileSync(EXPECTATIONS_PATH, "utf8") !== rendered) {
    throw new Error(
      "tests/fixtures/expectations.json does not match the Expect: comments in " +
        "the vendored fixtures. It is derived, not authored — run " +
        "`npm run oracle:derive` rather than editing it.",
    );
  }
  process.stdout.write(
    "tests/fixtures/expectations.json matches the vendored fixtures.\n",
  );
}

function upstream(upstreamDir: string | undefined): void {
  withUpstream(upstreamDir, (root) => {
    const problems: string[] = [];

    // The selection itself is part of the claim: a fixture upstream changed so
    // that it no longer qualifies, or one dropped from the vendored copy, is
    // drift even though no vendored byte moved.
    const upstreamFiles = new Set(
      select(inUpstream(root)).map((expectation) => expectation.file),
    );
    const vendoredFiles = new Set<string>();
    for (const dir of CORPUS_DIRS) {
      for (const name of readdirSync(join(VENDOR_DIR, dir))) {
        if (name.endsWith(".xml")) vendoredFiles.add(`${dir}/${name}`);
      }
    }

    for (const file of upstreamFiles) {
      if (vendoredFiles.has(file)) {
        const mine = readFileSync(join(VENDOR_DIR, file));
        const theirs = readFileSync(join(root, "tests", file));
        if (!mine.equals(theirs))
          problems.push(`differs from upstream: ${file}`);
      } else {
        problems.push(`missing from the vendored copy: ${file}`);
      }
    }
    for (const file of vendoredFiles) {
      if (!upstreamFiles.has(file)) {
        problems.push(`not selected from upstream: ${file}`);
      }
    }

    const licence = readFileSync(join(VENDOR_DIR, "LICENSE"));
    if (!licence.equals(readFileSync(join(root, "LICENSE")))) {
      problems.push("differs from upstream: LICENSE");
    }

    if (problems.length > 0) {
      throw new Error(
        `The vendored oracle no longer matches feedparser at ${UPSTREAM_PIN}:\n` +
          problems.map((problem) => `  ${problem}`).join("\n"),
      );
    }
    process.stdout.write(
      `All ${String(upstreamFiles.size)} vendored fixtures and the licence ` +
        `match feedparser at ${UPSTREAM_PIN}.\n`,
    );
  });
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

// The test suite imports the derivation; only the command line runs a command.
if (import.meta.filename === process.argv[1]) {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "vendor":
      vendor(flagValue(argv, "--upstream"));
      break;
    case "derive":
      derive(argv.includes("--check"));
      break;
    case "upstream":
      upstream(flagValue(argv, "--upstream"));
      break;
    default:
      throw new Error("Usage: node scripts/oracle.ts <vendor|derive|upstream>");
  }
}
