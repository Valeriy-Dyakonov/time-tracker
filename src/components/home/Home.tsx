import { useT } from "../../i18n";
import { PRODUCTS, type ProductId } from "../products";

/** Start screen: one tile per tool. */
export default function Home({ jiraReady, onOpen }: { jiraReady: boolean; onOpen: (id: ProductId) => void }) {
  const m = useT().home;
  return (
    <section className="home">
      <h2>{m.title}</h2>
      <p className="muted">{m.intro}</p>
      <div className="home-tiles">
        {PRODUCTS.map((p) => (
          <button key={p.id} className={`home-tile t-${p.id}`} onClick={() => onOpen(p.id)}>
            <span className="home-ic">{p.icon}</span>
            <b>{m.products[p.id].name}</b>
            <span className="home-desc">{m.products[p.id].desc}</span>
            {p.needsJira && !jiraReady && <span className="home-warn">{m.needsJira}</span>}
            <span className="home-open">{m.open} →</span>
          </button>
        ))}
      </div>
    </section>
  );
}
