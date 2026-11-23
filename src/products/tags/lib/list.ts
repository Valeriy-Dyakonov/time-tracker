import type { ServiceTags } from "@/shared/types";

/** One line per tag, "service - branch - tag" (several branches are joined with a comma), for pasting elsewhere. */
export function tagsText(services: ServiceTags[]): string {
  return services
    .flatMap((s) => s.tags.map((t) => [s.project, t.branches.join(", "), t.name].filter(Boolean).join(" - ")))
    .join("\n");
}
