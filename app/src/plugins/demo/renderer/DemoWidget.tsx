// Demo-Widget — die eigentliche React-Komponente, lazy geladen über den Renderer-Entry.
// Bewusst minimal; nur Beleg, dass ein Plugin echtes React an einen Slot hängen kann.

export default function DemoWidget() {
  return <div className="plugin-demo-widget">Demo-Plugin aktiv 🧪</div>
}
