import { useT } from "@/i18n";
import { PRODUCTS, type ProductId } from "./products";

/** Start screen: one tile per tool, with what it does at a glance. */
export default function Home({ jiraReady, onOpen }: { jiraReady: boolean; onOpen: (id: ProductId) => void }) {
  const m = useT().home;
  return (
    <section className="home">
      <header className="home-head">
        <h1>{m.title}</h1>
        <p>{m.intro}</p>
      </header>
      <div className="home-tiles">
        {PRODUCTS.map((p) => {
          const t = m.products[p.id];
          return (
            <button key={p.id} className={`home-tile t-${p.id}`} onClick={() => onOpen(p.id)}>
              <span className="home-band" aria-hidden>
                <span className="home-ic">{p.icon}</span>
              </span>
              <span className="home-main">
                <b className="home-name">{t.name}</b>
                <span className="home-desc">{t.desc}</span>
                <ul className="home-points">
                  {t.points.map((x) => (
                    <li key={x}><svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-6.5" /></svg>{x}</li>
                  ))}
                </ul>
                <span className="home-foot">
                  {p.needsJira && !jiraReady ? <span className="home-warn">{m.needsJira}</span> : <span />}
                  <span className="home-open">{m.open}<svg viewBox="0 0 16 16" aria-hidden><path d="M6 3.5l4.5 4.5L6 12.5" /></svg></span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
