import type { ReactNode } from "react";

/** Tools of the app shown as tiles on the start screen. Add a product here, its texts in `home.products`, and its screen in App. */
export type ProductId = "worklog" | "dashboard";

export interface Product {
  id: ProductId;
  /** Without a Jira connection the tile says so (the tool still opens). */
  needsJira: boolean;
  icon: ReactNode;
}

export const PRODUCTS: Product[] = [
  {
    id: "worklog",
    needsJira: false,
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  },
  {
    id: "dashboard",
    needsJira: true,
    icon: <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  },
];
