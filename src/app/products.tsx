import type { ReactNode } from "react";

/** Tools of the app shown as tiles on the start screen. Add a product here, its texts in `home.products`, and its screen in App. */
export type ProductId = "worklog" | "dashboard" | "team" | "mrs" | "tags";

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
  {
    id: "mrs",
    needsJira: false,
    icon: <svg viewBox="0 0 24 24"><circle cx="6" cy="5.5" r="2.2" /><circle cx="6" cy="18.5" r="2.2" /><circle cx="18" cy="18.5" r="2.2" /><path d="M6 7.7v8.6M18 16.3V9.5a3 3 0 0 0-3-3h-3.5M13.8 4.2l-2.3 2.3 2.3 2.3" /></svg>,
  },
  {
    id: "tags",
    needsJira: false,
    icon: <svg viewBox="0 0 24 24"><path d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-7.7 7.7a1.5 1.5 0 0 1-2.12 0l-7.3-7.3A1.5 1.5 0 0 1 3 12.2z" /><circle cx="8" cy="8" r="1.4" /></svg>,
  },
  {
    id: "team",
    needsJira: false,
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5v4M12 11.5H5v5M12 11.5h7v5" /></svg>,
  },
];
