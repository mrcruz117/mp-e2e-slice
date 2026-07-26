// RSS 2.0 and Atom 1.0 into the four fields the reader needs. What each field
// means is feedparser's answer, not ours — tests/fixtures/ is the judge.
//
// The parser runs in `preserveOrder` mode because Atom's `type="xhtml"` titles
// are mixed content: their value is the inner markup, in document order.

import { XMLParser } from "fast-xml-parser";

export interface ParsedItem {
  /** The publisher's identity for the Item: `guid`, Atom `id`, else the link. */
  itemId: string | null;
  title: string | null;
  link: string | null;
  /** ISO 8601 in UTC, or null when the Feed gave no date or an unparseable one. */
  published: string | null;
}

export interface ParsedFeed {
  title: string | null;
  items: ParsedItem[];
}

const ATTRIBUTES = ":@";
const TEXT = "#text";

/** One element: its single tag key, plus `:@` when it carries attributes. */
type Node = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
});

/** feedparser resolves namespaces; matching on the local name is enough here. */
function tagOf(node: Node): string {
  const key = Object.keys(node).find((name) => name !== ATTRIBUTES) ?? "";
  return key.slice(key.indexOf(":") + 1);
}

function childrenOf(node: Node): Node[] {
  const key = Object.keys(node).find((name) => name !== ATTRIBUTES);
  return key === undefined ? [] : ((node[key] ?? []) as Node[]);
}

function attributesOf(node: Node): Record<string, string> {
  return (node[ATTRIBUTES] ?? {}) as Record<string, string>;
}

function find(nodes: Node[], tag: string): Node | undefined {
  return nodes.find((node) => tagOf(node) === tag);
}

function findAll(nodes: Node[], tag: string): Node[] {
  return nodes.filter((node) => tagOf(node) === tag);
}

/** The element's character data, with its own child elements ignored. */
function textOf(node: Node | undefined): string {
  if (node === undefined) return "";
  return childrenOf(node)
    .filter((child) => TEXT in child)
    .map((child) => String(child[TEXT]))
    .join("");
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** Inner markup of an `type="xhtml"` element, back to the string it came from. */
function innerMarkup(nodes: Node[]): string {
  return nodes
    .map((node) => {
      if (TEXT in node) {
        return String(node[TEXT]).replace(
          /[&<>]/g,
          (char) => ESCAPES[char] ?? char,
        );
      }
      const tag = tagOf(node);
      const attributes = Object.entries(attributesOf(node))
        .map(([name, value]) => ` ${name}="${value}"`)
        .join("");
      return `<${tag}${attributes}>${innerMarkup(childrenOf(node))}</${tag}>`;
    })
    .join("");
}

/**
 * Atom's `type` decides how a text construct is read: `xhtml` is markup in the
 * document, a media type of `application/octet-stream` is base64, and everything
 * else — `text`, `html`, absent, empty — is the character data itself.
 */
function textConstruct(node: Node | undefined): string | null {
  if (node === undefined) return null;
  const type = attributesOf(node).type ?? "";
  if (type === "xhtml") {
    const div = find(childrenOf(node), "div");
    return innerMarkup(childrenOf(div ?? node)).trim();
  }
  const text = textOf(node).trim();
  if (type === "application/octet-stream") {
    return Buffer.from(text, "base64").toString("utf8");
  }
  return text;
}

// RSS and Atom name the same two instants differently, and Dublin Core adds a
// third spelling of each. An Item shows one date, so publication wins.
const PUBLISHED_TAGS = ["pubDate", "published", "issued"];
const UPDATED_TAGS = ["updated", "modified", "date"];

function firstDate(children: Node[], tags: string[]): string | null {
  for (const tag of tags) {
    const node = find(children, tag);
    if (node !== undefined) {
      const text = textOf(node).trim();
      if (text !== "") return text;
    }
  }
  return null;
}

/** RFC 822, RFC 3339 and W3CDTF all parse; anything else becomes null. */
function toIso(raw: string | null): string | null {
  if (raw === null) return null;
  const milliseconds = Date.parse(raw);
  return Number.isNaN(milliseconds)
    ? null
    : new Date(milliseconds).toISOString();
}

/**
 * The Item's link. RSS gives it as an element, or as a `guid` that is itself a
 * permalink; Atom gives it as the `href` of the alternate link.
 */
function linkOf(children: Node[]): string | null {
  for (const node of findAll(children, "link")) {
    const href = attributesOf(node).href;
    if (href !== undefined) {
      const relation = attributesOf(node).rel ?? "alternate";
      if (relation === "alternate") return href;
      continue;
    }
    const text = textOf(node).trim();
    if (text !== "") return text;
  }

  const guid = find(children, "guid");
  if (guid !== undefined && attributesOf(guid).isPermaLink !== "false") {
    const text = textOf(guid).trim();
    if (text !== "") return text;
  }
  return null;
}

function itemIdOf(children: Node[], link: string | null): string | null {
  for (const tag of ["guid", "id"]) {
    const text = textOf(find(children, tag)).trim();
    if (text !== "") return text;
  }
  return link;
}

function parseItem(node: Node): ParsedItem {
  const children = childrenOf(node);
  const link = linkOf(children);
  return {
    itemId: itemIdOf(children, link),
    title: textConstruct(find(children, "title")),
    link,
    published: toIso(
      firstDate(children, PUBLISHED_TAGS) ?? firstDate(children, UPDATED_TAGS),
    ),
  };
}

/**
 * One Feed's XML. Throws when the body carries no Feed at all — feedparser is
 * lenient about malformed markup and so is this; a body that yields no channel
 * and no feed element is the failure worth naming.
 */
export function parseFeed(xml: string): ParsedFeed {
  const roots = parser.parse(xml) as Node[];
  const rss = find(roots, "rss");
  const container = rss
    ? find(childrenOf(rss), "channel")
    : find(roots, "feed");
  if (container === undefined) {
    throw new Error("Feed XML has no RSS channel and no Atom feed element");
  }

  const children = childrenOf(container);
  return {
    title: textConstruct(find(children, "title")),
    items: [...findAll(children, "item"), ...findAll(children, "entry")].map(
      parseItem,
    ),
  };
}
