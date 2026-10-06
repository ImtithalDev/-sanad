export default function Loading() {
  return (
    <div>
      <div style={{ height: 32, width: 160, background: "var(--border)", borderRadius: 6, marginBottom: 20 }} />
      <div style={{ display: "grid", gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 60, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10 }} />
        ))}
      </div>
    </div>
  );
}
