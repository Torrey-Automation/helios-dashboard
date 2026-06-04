import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are the procurement intelligence agent for Helios Precision Optics, a DCAA-audited aerospace engineering firm headquartered in San Diego, California. Helios generates approximately $50M in annual revenue across cost-plus-fixed-fee (CPFF), firm-fixed-price (FFP), and time-and-materials (T&M) contracts primarily with NAVAIR, NRO, and select commercial satellite integrators. The firm employs approximately 85 people, holds ISO 9001 and AS9100 certification, and maintains an active DCAA floor check relationship with the San Diego DCAA branch office.

All procurement activity is subject to FAR Part 31 allowability standards, CAS 401, 402, and 416 where applicable, and ongoing DCAA audit scrutiny.

THE THREE PROGRAMS:
LANCER-7 — CPFF contract with NAVAIR. Spaceborne imaging payload. Currently at 71% of contract ceiling with 58% of work complete. This program is under EAC pressure. Any procurement exception on LANCER-7 is automatically higher priority.
MERIDIAN — FFP contract with a commercial satellite integrator. Custom opto-mechanical assembly. Fixed price means cost overruns come out of Helios margin.
ATLAS-2 — T&M contract with NRO. Laser designator development. Misclassifying a cost here is a direct billing error to the government with False Claims Act exposure.

EXCEPTION FORMAT (follow this exactly):
**EXCEPTION: [PO number] — [vendor] — [type]**

**What happened:** [One sentence. Factual only.]

**Why it matters:** [One to two sentences. Cite FAR or CAS references when applicable.]

**Options:**
1. [Action] — [one-line consequence]
2. [Action] — [one-line consequence]
3. [Action if applicable] — [one-line consequence]

**Recommendation:** [One option. One sentence of rationale. State confidence: HIGH / MEDIUM / LOW.]

**What I need from you:** [One specific action.]

CLEAN MATCH FORMAT:
**CLEAN: [PO number] — [vendor]**
All seven match conditions verified. [One sentence summary.] Queued for payment approval.

For follow-up questions, respond concisely as a knowledgeable procurement analyst would. Cite specific FAR/CAS references. Keep answers under 150 words unless the question demands more.

VENDOR PERFORMANCE DATA:
Sydor Optics: 82% on-time delivery. 30% partial delivery rate on orders >8 units. Two prior partials completed in 9-11 days. Zero abandoned partials. Known pattern: invoices full PO quantity before balance ships.
Apex PCB Assembly: 91% on-time delivery. Two WBS coding errors in last 12 months (both involved LANCER-7 costs coded to wrong programs). Recurring issue.
Thorlabs: 98% on-time. Clean history. Auto-process candidate under $5K.

APPROVAL THRESHOLDS:
Under $5,000: PM approval sufficient.
$5,000–$25,000: PM + Buyer.
$25,000–$100,000: VP Ops + CFO dual approval.
Above $100,000: VP Ops + CFO + check consent of contracting officer.
LANCER-7 above $10,000: always include EAC impact note.

THREE-WAY MATCH RULES (all 7 must be true):
1. Invoice vendor matches PO vendor (legal entity name)
2. Invoice line quantities ≤ GR received quantities
3. Invoice unit prices within $250 or 2% of PO price (whichever is lower)
4. Payment terms match
5. GR inspection status is Pass
6. WBS element on invoice matches WBS on PO
7. Delivery date on GR falls within contract period of performance

NEVER release payment, transmit vendor communications, or modify records without explicit human approval.`;

const INVOICES = [
  {
    id: "TH-99231",
    vendor: "Thorlabs, Inc.",
    po: "PO-2026-0418",
    program: "ATLAS-2",
    wbs: "2.1.4",
    part: "TH-PM100D",
    desc: "Optical power meter console",
    invoicedQty: 2,
    unitPrice: 1450,
    grQty: 2,
    poQty: 2,
    poWbs: "2.1.4",
    terms: "Net 30",
    dueDate: "2026-07-09",
    status: "clean",
    type: "CLEAN",
  },
  {
    id: "SY-44817",
    vendor: "Sydor Optics, LLC",
    po: "PO-2026-0412",
    program: "LANCER-7",
    wbs: "3.2.1",
    part: "SY-NBK7-50",
    desc: "N-BK7 optical blank, 50mm",
    invoicedQty: 12,
    unitPrice: 400,
    grQty: 10,
    poQty: 12,
    poWbs: "3.2.1",
    terms: "Net 45",
    dueDate: "2026-07-25",
    status: "exception",
    type: "QUANTITY",
  },
  {
    id: "AP-7723",
    vendor: "Apex PCB Assembly, Inc.",
    po: "PO-2026-0421",
    program: "LANCER-7",
    wbs: "1.3.1",
    part: "AP-CTRL-R3",
    desc: "Control board assembly, Rev 3",
    invoicedQty: 6,
    unitPrice: 2850,
    grQty: 6,
    poQty: 6,
    poWbs: "3.4.2",
    terms: "Net 30",
    dueDate: "2026-07-11",
    status: "exception",
    type: "CODING",
  },
];

function buildInvoiceContext(inv) {
  return `Evaluate this invoice against the three-way match rules:

INVOICE: ${inv.id}
Date: 2026-06-${inv.id === "TH-99231" ? "09" : inv.id === "SY-44817" ? "10" : "11"}
Vendor: ${inv.vendor}
PO: ${inv.po}
Program: ${inv.program}
WBS on invoice: ${inv.wbs}
Part: ${inv.part} — ${inv.desc}
Invoiced qty: ${inv.invoicedQty}
Unit price: $${inv.unitPrice.toLocaleString()}
Extended: $${(inv.invoicedQty * inv.unitPrice).toLocaleString()}
Payment terms: ${inv.terms}

PURCHASE ORDER DATA:
PO: ${inv.po}
WBS: ${inv.poWbs}
Ordered qty: ${inv.poQty}
Unit price: $${inv.unitPrice.toLocaleString()}

GOODS RECEIPT:
Received qty: ${inv.grQty}
Inspection: Pass
Date received: 2026-06-0${inv.id === "TH-99231" ? "8" : "9"}

Provide your analysis in the required format.`;
}

const BACKEND_URL = "https://helios-backend-hsr9.onrender.com";

async function callClaude(messages, onChunk) {
  const resp = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemPrompt: SYSTEM_PROMPT,
      messages,
    }),
  });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6);
      try {
        const ev = JSON.parse(raw);
        if (ev.type === "text") {
          full += ev.text;
          onChunk(full);
        }
      } catch {}
    }
  }
  return full;
}

function formatMarkdown(text) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    let processed = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code style="background:rgba(128,128,128,0.12);padding:1px 5px;border-radius:3px;font-size:0.9em">$1</code>');
    if (/^\d+\.\s/.test(processed)) {
      processed = `<div style="padding-left:1.2em;text-indent:-1.2em;margin:3px 0">${processed}</div>`;
    }
    return processed;
  }).join("<br/>");
}

const COLORS = {
  bg: "#0D0F11",
  card: "#151820",
  cardHover: "#1A1F2A",
  border: "#252A35",
  borderHover: "#3A4050",
  text: "#D4D4D8",
  textMuted: "#71717A",
  textFaint: "#52525B",
  accent: "#3B82F6",
  accentDim: "rgba(59,130,246,0.12)",
  green: "#22C55E",
  greenDim: "rgba(34,197,94,0.10)",
  greenBorder: "rgba(34,197,94,0.25)",
  amber: "#F59E0B",
  amberDim: "rgba(245,158,11,0.10)",
  amberBorder: "rgba(245,158,11,0.25)",
  red: "#EF4444",
  redDim: "rgba(239,68,68,0.08)",
  white: "#F4F4F5",
  panelBg: "#12141A",
};

const StatusPill = ({ status, type }) => {
  const isClean = status === "clean";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      letterSpacing: "0.05em", textTransform: "uppercase",
      background: isClean ? COLORS.greenDim : COLORS.amberDim,
      color: isClean ? COLORS.green : COLORS.amber,
      border: `1px solid ${isClean ? COLORS.greenBorder : COLORS.amberBorder}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: isClean ? COLORS.green : COLORS.amber,
      }}/>
      {isClean ? "Cleared" : type}
    </span>
  );
};

const InvoiceCard = ({ inv, selected, onClick }) => {
  const isSel = selected?.id === inv.id;
  return (
    <div onClick={onClick} style={{
      background: isSel ? COLORS.cardHover : COLORS.card,
      border: `1px solid ${isSel ? COLORS.accent : COLORS.border}`,
      borderRadius: 10, padding: "16px 18px", cursor: "pointer",
      transition: "all 0.2s",
      boxShadow: isSel ? `0 0 0 1px ${COLORS.accent}` : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 2 }}>{inv.po}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white }}>{inv.vendor}</div>
        </div>
        <StatusPill status={inv.status} type={inv.type}/>
      </div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 8 }}>{inv.desc}</div>
      <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
        <div>
          <span style={{ color: COLORS.textFaint }}>Invoice </span>
          <span style={{ color: COLORS.text, fontWeight: 500 }}>${(inv.invoicedQty * inv.unitPrice).toLocaleString()}</span>
        </div>
        <div>
          <span style={{ color: COLORS.textFaint }}>Program </span>
          <span style={{ color: COLORS.text, fontWeight: 500 }}>{inv.program}</span>
        </div>
        <div>
          <span style={{ color: COLORS.textFaint }}>Due </span>
          <span style={{ color: COLORS.text, fontWeight: 500 }}>{inv.dueDate}</span>
        </div>
      </div>
    </div>
  );
};

export default function HeliosDashboard() {
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState({});
  const [loading, setLoading] = useState({});
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState({});
  const [chatLoading, setChatLoading] = useState(false);
  const [actions, setActions] = useState({});
  const chatEndRef = useRef(null);
  const analysisRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, analysis]);

  useEffect(() => {
    if (analysisRef.current) analysisRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, [selected?.id]);

  const analyzeInvoice = async (inv) => {
    if (analysis[inv.id]) return;
    setLoading((p) => ({ ...p, [inv.id]: true }));
    const msg = [{ role: "user", content: buildInvoiceContext(inv) }];
    await callClaude(msg, (text) => setAnalysis((p) => ({ ...p, [inv.id]: text })));
    setLoading((p) => ({ ...p, [inv.id]: false }));
  };

  const handleSelect = (inv) => {
    setSelected(inv);
    analyzeInvoice(inv);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !selected) return;
    const q = chatInput.trim();
    setChatInput("");
    const prev = chatHistory[selected.id] || [];
    const updated = [...prev, { role: "user", text: q }];
    setChatHistory((p) => ({ ...p, [selected.id]: updated }));
    setChatLoading(true);
    const messages = [
      { role: "user", content: buildInvoiceContext(selected) },
      { role: "assistant", content: analysis[selected.id] || "" },
    ];
    for (const m of prev) {
      messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.text });
    }
    messages.push({ role: "user", content: q });
    const withReply = [...updated, { role: "assistant", text: "" }];
    setChatHistory((p) => ({ ...p, [selected.id]: withReply }));
    await callClaude(messages, (text) => {
      setChatHistory((p) => {
        const arr = [...(p[selected.id] || [])];
        arr[arr.length - 1] = { role: "assistant", text };
        return { ...p, [selected.id]: arr };
      });
    });
    setChatLoading(false);
  };

  const handleAction = (invId, action) => {
    const ts = new Date().toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    setActions((p) => ({ ...p, [invId]: { action, ts } }));
  };

  const curChat = selected ? (chatHistory[selected.id] || []) : [];
  const curAction = selected ? actions[selected.id] : null;

  const queueStats = {
    total: INVOICES.length,
    clean: INVOICES.filter(i => i.status === "clean").length,
    exceptions: INVOICES.filter(i => i.status === "exception").length,
    totalValue: INVOICES.reduce((s, i) => s + i.invoicedQty * i.unitPrice, 0),
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${COLORS.accent}, #6366F1)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>H</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.white, letterSpacing: "-0.01em" }}>Helios Procurement Intelligence</div>
            <div style={{ fontSize: 11, color: COLORS.textFaint }}>Exception queue — Monday, June 9, 2026</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: COLORS.textFaint }}>Queue</div>
            <div style={{ fontWeight: 600, color: COLORS.white, fontFamily: "'DM Mono', monospace" }}>{queueStats.total}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: COLORS.textFaint }}>Cleared</div>
            <div style={{ fontWeight: 600, color: COLORS.green, fontFamily: "'DM Mono', monospace" }}>{queueStats.clean}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: COLORS.textFaint }}>Review</div>
            <div style={{ fontWeight: 600, color: COLORS.amber, fontFamily: "'DM Mono', monospace" }}>{queueStats.exceptions}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: COLORS.textFaint }}>Value</div>
            <div style={{ fontWeight: 600, color: COLORS.white, fontFamily: "'DM Mono', monospace" }}>${queueStats.totalValue.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 65px)" }}>
        {/* Left: Invoice list */}
        <div style={{ width: 380, minWidth: 380, borderRight: `1px solid ${COLORS.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 2px 6px" }}>
            Weekend invoices — {INVOICES.length} received
          </div>
          {INVOICES.map((inv) => (
            <InvoiceCard key={inv.id} inv={inv} selected={selected} onClick={() => handleSelect(inv)}/>
          ))}
        </div>

        {/* Right: Analysis panel */}
        <div ref={analysisRef} style={{ flex: 1, padding: 24, overflowY: "auto", maxHeight: "calc(100vh - 65px)" }}>
          {!selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: COLORS.card, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textFaint} strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              </div>
              <div style={{ color: COLORS.textFaint, fontSize: 13 }}>Select an invoice to see the agent's analysis</div>
            </div>
          ) : (
            <div>
              {/* Invoice detail header */}
              <div style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "16px 20px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>Invoice {selected.id}</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.white, marginTop: 2 }}>{selected.vendor}</div>
                  </div>
                  <StatusPill status={selected.status} type={selected.type}/>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16,
                  padding: "12px 0 0", borderTop: `1px solid ${COLORS.border}`,
                }}>
                  {[
                    ["PO", selected.po],
                    ["Program", selected.program],
                    ["WBS (invoice)", selected.wbs],
                    ["WBS (PO)", selected.poWbs],
                    ["Invoiced qty", selected.invoicedQty],
                    ["Received qty", selected.grQty],
                    ["Unit price", `$${selected.unitPrice.toLocaleString()}`],
                    ["Extended", `$${(selected.invoicedQty * selected.unitPrice).toLocaleString()}`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: COLORS.textFaint }}>{label}</div>
                      <div style={{
                        fontSize: 13, fontWeight: 500, fontFamily: "'DM Mono', monospace",
                        color: (label === "WBS (invoice)" && selected.wbs !== selected.poWbs)
                          ? COLORS.red
                          : (label === "Invoiced qty" && selected.invoicedQty !== selected.grQty)
                            ? COLORS.amber
                            : COLORS.white,
                      }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent analysis */}
              <div style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "16px 20px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6,
                    background: `linear-gradient(135deg, ${COLORS.accent}, #6366F1)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "#fff",
                  }}>H</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textMuted }}>Agent analysis</div>
                  {loading[selected.id] && (
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", background: COLORS.accent,
                      animation: "pulse 1s ease-in-out infinite",
                    }}/>
                  )}
                </div>
                <style>{`@keyframes pulse { 0%,100% { opacity: .3 } 50% { opacity: 1 } }`}</style>
                {analysis[selected.id] ? (
                  <div
                    style={{ fontSize: 13, lineHeight: 1.75, color: COLORS.text }}
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(analysis[selected.id]) }}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: COLORS.textFaint, fontStyle: "italic" }}>
                    Evaluating invoice against three-way match rules...
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {selected.status === "exception" && !curAction && analysis[selected.id] && !loading[selected.id] && (
                <div style={{
                  display: "flex", gap: 8, marginBottom: 16,
                }}>
                  {selected.type === "QUANTITY" ? (
                    <>
                      <button onClick={() => handleAction(selected.id, "Partial payment approved — 10 units at $400. Balance on open PO.")}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `1px solid ${COLORS.greenBorder}`, background: COLORS.greenDim, color: COLORS.green, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Approve partial (10 units)
                      </button>
                      <button onClick={() => handleAction(selected.id, "Invoice held pending full delivery. Vendor notification drafted.")}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        Hold for full delivery
                      </button>
                      <button onClick={() => handleAction(selected.id, "Escalated to buyer for vendor discussion.")}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        Escalate to buyer
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleAction(selected.id, "Invoice returned — vendor notified to resubmit with corrected WBS 3.4.2 (LANCER-7).")}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `1px solid ${COLORS.amberBorder}`, background: COLORS.amberDim, color: COLORS.amber, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Request corrected invoice
                      </button>
                      <button onClick={() => handleAction(selected.id, "Buyer confirms clerical error. Correcting WBS to 3.4.2 (LANCER-7). Documentation attached.")}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        Confirm as clerical error
                      </button>
                      <button onClick={() => handleAction(selected.id, "Routed to accounting and PM for formal cost charging review.")}
                        style={{ flex: 1, padding: "10px 16px", borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.text, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        Escalate to accounting
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Action confirmation */}
              {curAction && (
                <div style={{
                  background: COLORS.greenDim, border: `1px solid ${COLORS.greenBorder}`,
                  borderRadius: 10, padding: "14px 18px", marginBottom: 16,
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.green} strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}><path d="M20 6L9 17l-5-5"/></svg>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.green }}>{curAction.action}</div>
                    <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      Logged {curAction.ts} — Audit trail ID: HPO-{Math.random().toString(36).slice(2, 8).toUpperCase()}
                    </div>
                  </div>
                </div>
              )}

              {/* Chat thread */}
              {analysis[selected.id] && !loading[selected.id] && (
                <div style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, overflow: "hidden",
                }}>
                  <div style={{ padding: "12px 18px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 12, fontWeight: 600, color: COLORS.textMuted }}>
                    Follow-up — ask the agent anything about this invoice
                  </div>
                  {curChat.length > 0 && (
                    <div style={{ padding: "12px 18px", maxHeight: 300, overflowY: "auto" }}>
                      {curChat.map((m, i) => (
                        <div key={i} style={{
                          marginBottom: 12,
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: m.role === "user" ? COLORS.accentDim : COLORS.panelBg,
                          border: `1px solid ${m.role === "user" ? "rgba(59,130,246,0.2)" : COLORS.border}`,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.textFaint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {m.role === "user" ? "You" : "Agent"}
                          </div>
                          <div
                            style={{ fontSize: 13, lineHeight: 1.7, color: COLORS.text }}
                            dangerouslySetInnerHTML={{ __html: formatMarkdown(m.text || "...") }}
                          />
                        </div>
                      ))}
                      <div ref={chatEndRef}/>
                    </div>
                  )}
                  <div style={{ display: "flex", borderTop: `1px solid ${COLORS.border}` }}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChat()}
                      placeholder="e.g. What if Sydor doesn't deliver in 14 days?"
                      disabled={chatLoading}
                      style={{
                        flex: 1, padding: "12px 18px", background: "transparent", border: "none",
                        color: COLORS.white, fontSize: 13, outline: "none",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    />
                    <button
                      onClick={handleChat}
                      disabled={chatLoading || !chatInput.trim()}
                      style={{
                        padding: "12px 18px", background: "transparent", border: "none",
                        color: chatInput.trim() ? COLORS.accent : COLORS.textFaint,
                        cursor: chatInput.trim() ? "pointer" : "default",
                        fontSize: 13, fontWeight: 600,
                      }}
                    >Send</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
