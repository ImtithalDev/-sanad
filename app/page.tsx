import Link from "next/link";

// Real landing page (replaces the Phase 2 placeholder). Server component,
// no client JS needed — everything here is static marketing copy plus links
// into the real signup/login flow.
export default function LandingPage() {
  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 18 }}>سند — Sanad</strong>
        <nav style={{ display: "flex", gap: 10 }}>
          <Link href="/login" style={{ padding: "8px 14px", textDecoration: "none", color: "var(--text)", fontSize: 14 }}>
            تسجيل الدخول
          </Link>
          <Link href="/signup" className="btn-primary" style={{ width: "auto", padding: "8px 16px", textDecoration: "none", display: "inline-block", fontSize: 14 }}>
            ابدأ مجانًا
          </Link>
        </nav>
      </header>

      <section style={{ textAlign: "center", padding: "64px 20px 48px", maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, lineHeight: 1.3, margin: "0 0 16px" }}>أنشئ عروض أسعار وفواتير احترافية في دقائق</h1>
        <p style={{ fontSize: 17, color: "var(--muted)", margin: "0 0 28px" }}>
          سند منصة عربية للمستقلين وأصحاب الأعمال الصغيرة لإدارة العملاء وعروض الأسعار والفواتير — مع PDF احترافي ومشاركة فورية ومساعد ذكاء اصطناعي يسرّع عملك الإداري.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn-primary" style={{ width: "auto", padding: "12px 28px", textDecoration: "none", display: "inline-block" }}>
            ابدأ مجانًا الآن
          </Link>
          <Link href="/login" className="btn-secondary" style={{ width: "auto", padding: "12px 28px", textDecoration: "none", display: "inline-block" }}>
            لدي حساب بالفعل
          </Link>
        </div>
      </section>

      <section style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 56px", display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {[
          { title: "عملاء وعروض أسعار وفواتير", desc: "أنشئ ونظّم كل مستنداتك من مكان واحد، مع ترقيم تلقائي وحسابات دقيقة." },
          { title: "PDF عربي واحترافي", desc: "مستندات RTL جاهزة للطباعة والمشاركة عبر واتساب والبريد الإلكتروني." },
          { title: "مساعد بالذكاء الاصطناعي", desc: "حوّل وصفًا بسيطًا إلى عرض سعر كامل، أو حسّن صياغة الوصف، خلال ثوانٍ." },
          { title: "مشاركة آمنة", desc: "روابط مشاركة خاصة يمكنك إلغاؤها في أي وقت، دون كشف بيانات حسابك." },
        ].map((f) => (
          <div key={f.title} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, background: "var(--card)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{f.title}</h3>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{f.desc}</p>
          </div>
        ))}
      </section>

      <section style={{ background: "var(--card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "48px 20px" }}>
        <h2 style={{ textAlign: "center", marginBottom: 28 }}>باقات بسيطة وواضحة</h2>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", maxWidth: 900, margin: "0 auto" }}>
          {[
            { name: "مجاني", price: "0", desc: "لتجربة سند والبدء بعدد محدود من العملاء والمستندات." },
            { name: "برو", price: "49", desc: "حدود أعلى بكثير للمستندات والعملاء، واستخدام أوسع للذكاء الاصطناعي." },
            { name: "أعمال", price: "149", desc: "عملاء ومستندات غير محدودة، لأعلى مستوى استخدام." },
          ].map((p) => (
            <div key={p.name} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 22, background: "#fff", textAlign: "center" }}>
              <h3 style={{ margin: "0 0 6px" }}>{p.name}</h3>
              <p style={{ fontSize: 24, fontWeight: 700, margin: "0 0 10px" }}>
                {p.price === "0" ? "مجاني" : `${p.price} ر.س`}
                {p.price !== "0" && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}> / شهريًا</span>}
              </p>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ textAlign: "center", padding: "48px 20px" }}>
        <h2 style={{ marginBottom: 12 }}>جاهز لإنشاء أول فاتورة لك؟</h2>
        <Link href="/signup" className="btn-primary" style={{ width: "auto", padding: "12px 28px", textDecoration: "none", display: "inline-block" }}>
          ابدأ مجانًا
        </Link>
      </section>

      <footer style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13, borderTop: "1px solid var(--border)" }}>
        سند — Sanad · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
