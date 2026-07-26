/** One Item as the read endpoint returns it. Shared with the front end. */
export interface Item {
  id: number;
  /** The publisher's identity for the Item: `guid`, Atom `id`, else its link. */
  itemId: string;
  feedTitle: string | null;
  title: string | null;
  link: string | null;
  published: string | null;
  read: boolean;
}
