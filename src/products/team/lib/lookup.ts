import { api } from "@/shared/api";
import { memoAsync } from "./memo";

/** Search in a system by name: the same phrase is asked from the server once per run of the app. */
export const searchPeople = memoAsync((system: string, query: string) => `${system}|${query.trim().toLowerCase()}`, api.searchPeople);

/** The user's own accounts, read once. */
export const myAccounts = memoAsync(() => "me", api.myAccounts);
