import { keyColor } from "@/shared/ui";

const initials = (name: string) =>
  name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Initials in a circle coloured by the name: tells people apart at a glance without loading photos. */
export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: keyColor(name) }} aria-hidden>
      {initials(name)}
    </span>
  );
}
