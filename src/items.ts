/** One Item as the read endpoint returns it. Shared with the front end. */
export interface Item {
  id: number;
  feedTitle: string | null;
  title: string | null;
  link: string | null;
  published: string | null;
  read: boolean;
}
