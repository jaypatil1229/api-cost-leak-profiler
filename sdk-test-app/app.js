const $ = (id) => document.getElementById(id);
const features = $("feature");
const scenario = $("scenario");
const scenarioHelp = {
  duplicate: "Sends the exact same feature prompt twice with distinct event IDs. The shared prompt hash lets the duplicate detector group them.",
  "retry-loop": "Makes five rapid calls with the same prompt, model, and session. This produces the repeated-call pattern the current detector identifies as a possible retry loop.",
  "unbounded-context": "Makes five chat calls while retaining an increasingly long transcript. Input token counts should rise across one session.",
  "oversized-prompt": "Expands the source material to roughly 260k characters (about 50k+ tokens). This can cost more and may exceed a model's context limit.",
  "spend-spike": "Writes one small baseline event 90 minutes ago, then makes four larger calls now. Detection compares adjacent one-hour windows; make sure ACLP pricing exists for your chosen model."
};
scenario.addEventListener("change", () => { $("scenarioHelp").textContent = scenarioHelp[scenario.value]; });
scenario.dispatchEvent(new Event("change"));

function number(value) { return Number(value || 0).toLocaleString(); }
function render(data) {
  const t = data.totals;
  $("calls").textContent = number(t.calls);
  $("tokens").textContent = number(t.totalTokens);
  $("inputTokens").textContent = number(t.inputTokens);
  $("outputTokens").textContent = number(t.outputTokens);
  $("byFeature").innerHTML = Object.entries(t.byFeature).sort((a,b) => b[1].totalTokens-a[1].totalTokens).map(([name,row]) => `<div class="feature-row"><span>${name}</span><b>${number(row.totalTokens)} tok · ${row.calls} calls</b></div>`).join("") || '<div class="muted">Feature totals will appear after your first request.</div>';
  $("events").innerHTML = data.events.length ? data.events.map(e => `<tr><td>${e.featureId}</td><td>${e.model}</td><td>${number(e.inputTokens)}</td><td>${number(e.outputTokens)}</td><td>${e.status}</td><td>${e.ingestion || (e.eventId ? "queued" : "—")}</td></tr>`).join("") : '<tr><td colspan="6" class="empty">No events yet.</td></tr>';
}
async function refresh() { const response = await fetch("/api/events"); render(await response.json()); }
async function status() {
  const s = await (await fetch("/api/status")).json();
  const pill = $("connection");
  pill.textContent = s.configured ? (s.ingestConfigured ? `Gemini · ACLP connected · ${s.model}` : `Gemini · ACLP not configured · ${s.model}`) : "Add Gemini key in .env";
  pill.className = `pill ${s.configured && s.ingestConfigured ? "good" : s.configured ? "" : "bad"}`;
}
async function run(button, body) {
  button.disabled = true; button.dataset.label ||= button.textContent; button.textContent = "Calling Gemini…";
  $("resultMeta").textContent = "Waiting for provider response";
  try {
    const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    $("output").textContent = result.outputs.map((o,i) => `Call ${i+1} · ${o.featureId} · ${number(o.usage.totalTokens)} tokens\n${o.text}`).join("\n\n────────────────────────\n\n");
    $("resultMeta").textContent = `${result.outputs.length} Gemini call(s) · metadata emitted`;
    await refresh();
  } catch (error) { $("output").textContent = error.message; $("resultMeta").textContent = "Request failed"; }
  finally { button.disabled = false; button.textContent = button.dataset.label; }
}
$("runFeature").addEventListener("click", (event) => run(event.currentTarget, { feature: features.value, text: $("input").value, scenario: "normal" }));
$("runScenario").addEventListener("click", (event) => run(event.currentTarget, { feature: features.value, text: $("input").value, scenario: scenario.value }));
$("refresh").addEventListener("click", refresh);
status(); refresh(); setInterval(refresh, 5000);
