const $ = (id) => document.getElementById(id);
const features = $("feature");
const scenario = $("scenario");
$("runScenario").dataset.label = $("runScenario").textContent.trim();
const scenarioHelp = {
  duplicate: "Sends the exact same feature prompt twice with distinct event IDs. The shared prompt hash lets the duplicate detector group them.",
  "retry-loop": "Sends five separate real Gemini requests with the same prompt, model, session, and operation ID. The wrapper does not expose provider-internal retries. A finding requires five unique events, at least two genuine ERROR/TIMEOUT/RATE_LIMITED outcomes, and no adjacent gap over 2 seconds; successful calls alone correctly produce no finding. This app reports delivery but does not verify persistence or run detection.",
  "retry-loop-simulated": "TEST ONLY: sends five explicitly simulated retry outcomes through ACLP ingestion; it makes no Gemini calls and does not represent provider failures.",
  "unbounded-context": "Makes five chat calls while retaining an increasingly long transcript. Input token counts should rise across one session.",
  "oversized-prompt": "Expands the source material to roughly 260k characters (about 50k+ tokens). This can cost more and may exceed a model's context limit.",
  "spend-spike": "Two stages: one real, small baseline call now, then ten large real Gemini requests after 15 minutes. The test app keeps the baseline run across server restarts and offers an explicit fresh-baseline recovery if the run is missing or expired. This app reports provider and ingestion outcomes but does not verify database persistence or run detection.",
  "anomaly-detection": "Generates a baseline of normal usage, then adds anomalous patterns (unusually large requests, extreme costs, outlier token counts). Requires Python analytics service for Isolation Forest detection."
};
scenario.addEventListener("change", () => { $("scenarioHelp").textContent = scenarioHelp[scenario.value]; });
scenario.dispatchEvent(new Event("change"));

const spendSpikeStorageKey = "aclp-spend-spike-run";
let activeSpendSpike = null;
let spendSpikeRecoveryRequired = false;
try {
  const storedRun = localStorage.getItem(spendSpikeStorageKey) || sessionStorage.getItem(spendSpikeStorageKey);
  activeSpendSpike = JSON.parse(storedRun || "null");
} catch { activeSpendSpike = null; }
let spendSpikeTimer = null;
let scenarioRequestRunning = false;

function number(value) { return Number(value || 0).toLocaleString(); }
function updateSpendSpikeButton(button) {
  if (scenarioRequestRunning) return;
  if (scenario.value !== "spend-spike") {
    button.disabled = false;
    button.textContent = button.dataset.label || "Run selected scenario ↗";
    if (spendSpikeTimer) clearInterval(spendSpikeTimer);
    spendSpikeTimer = null;
    return;
  }
  if (spendSpikeRecoveryRequired) {
    button.disabled = false;
    button.textContent = "Start fresh baseline";
    if (spendSpikeTimer) clearInterval(spendSpikeTimer);
    spendSpikeTimer = null;
    return;
  }
  if (!activeSpendSpike) {
    button.disabled = false;
    button.textContent = button.dataset.label || "Run selected scenario ↗";
    if (spendSpikeTimer) clearInterval(spendSpikeTimer);
    spendSpikeTimer = null;
    return;
  }
  const remaining = Math.max(0, Date.parse(activeSpendSpike.readyAt) - Date.now());
  if (remaining === 0) {
    button.disabled = false;
    button.textContent = "Run spend burst";
    if (spendSpikeTimer) clearInterval(spendSpikeTimer);
    spendSpikeTimer = null;
    return;
  }
  button.disabled = true;
  const seconds = Math.ceil(remaining / 1000);
  button.textContent = `Baseline window · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  if (!spendSpikeTimer) spendSpikeTimer = setInterval(() => updateSpendSpikeButton(button), 1000);
}
scenario.addEventListener("change", () => updateSpendSpikeButton($("runScenario")));

function summarizeStages(result) {
  const e = result.execution;
  if (!e) return "Generation result received; delivery outcomes unavailable.";
  const delivery = `${e.ingestionAccepted} accepted · ${e.ingestionDuplicates} duplicate · ${e.ingestionRejected} rejected · ${e.deliveryUnconfirmed} unconfirmed`;
  const provider = `${e.providerRequests} Gemini request(s): ${e.providerSuccesses} success · ${e.providerFailures} failure`;
  if (result.stage === "baseline_ready") {
    return `Baseline stage complete · ${provider} · ACLP delivery ${delivery}. Burst is scheduled after ${new Date(result.readyAt).toLocaleTimeString()} local time. Persistence is not independently checked; detector has not run.`;
  }
  if (result.stage === "waiting_for_baseline_window") {
    return `Baseline event ${result.baselineEventId} was accepted. No Gemini request was made; wait until ${new Date(result.readyAt).toLocaleTimeString()} local time. Persistence is not independently checked; detector has not run.`;
  }
  const generation = result.stage === "complete" ? "Scenario generation complete" : `Scenario generation ${result.stage}`;
  if (result.scenario === "retry-loop") {
    return `${generation} · ${provider} · ACLP delivery ${delivery}. Observed ${e.providerFailures} genuine provider failure(s); detector execution and persistence verification are separate steps.`;
  }
  return `${generation} · ${provider} · ACLP delivery ${delivery}. Acceptance is not a database persistence check; the SDK test app does not run detection.`;
}

function safeErrorText(value) {
  return String(value || "")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .slice(0, 500);
}

function renderScenarioEvents(events = []) {
  if (!events.length) return "No new usage events were emitted in this stage.";
  return events.map((event) => `${event.eventId} · ${event.status} · ${event.model} · ${number(event.inputTokens)} in / ${number(event.outputTokens)} out · ACLP ${event.ingestion || "unconfirmed"}`).join("\n");
}
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

async function restoreSpendSpikeRun() {
  let stored = activeSpendSpike;
  if (stored?.scenarioRunId) {
    try {
      const response = await fetch(`/api/spend-spike/runs/${encodeURIComponent(stored.scenarioRunId)}`);
      const result = await response.json();
      if (response.ok && result.run?.stage === "baseline_ready") {
        activeSpendSpike = { scenarioRunId: result.run.scenarioRunId, readyAt: result.run.readyAt };
        localStorage.setItem(spendSpikeStorageKey, JSON.stringify(activeSpendSpike));
        sessionStorage.removeItem(spendSpikeStorageKey);
      } else {
        activeSpendSpike = null;
        localStorage.removeItem(spendSpikeStorageKey);
        sessionStorage.removeItem(spendSpikeStorageKey);
        spendSpikeRecoveryRequired = true;
        const reason = result.run?.stage || "missing or expired";
        $("output").textContent = `The saved Spend Spike run is ${reason} and cannot be continued. This recovery check made no Gemini calls. Start a fresh Spend Spike scenario to create a new baseline.`;
        $("resultMeta").textContent = "Recovery required · provider calls during recovery: 0 · detection has not run.";
      }
    } catch {
      // Retry using the server's active-run index below.
    }
  }

  if (!activeSpendSpike) {
    try {
      const response = await fetch("/api/spend-spike/runs/active");
      const result = await response.json();
      if (response.ok && result.run?.stage === "baseline_ready") {
        activeSpendSpike = { scenarioRunId: result.run.scenarioRunId, readyAt: result.run.readyAt };
        localStorage.setItem(spendSpikeStorageKey, JSON.stringify(activeSpendSpike));
        sessionStorage.removeItem(spendSpikeStorageKey);
        if (spendSpikeRecoveryRequired) {
          $("output").textContent = `Restored active Spend Spike baseline ${result.run.baselineEventId}. No Gemini request was made during recovery.`;
          $("resultMeta").textContent = "Saved run restored · provider calls: 0 · persistence and detection remain separate checks.";
        }
        spendSpikeRecoveryRequired = false;
      }
    } catch {
      // The scenario can still be started manually if the state lookup is unavailable.
    }
  }
  updateSpendSpikeButton($("runScenario"));
}

async function run(button, body) {
  scenarioRequestRunning = true;
  button.disabled = true; button.dataset.label ||= button.textContent; button.textContent = "Calling Gemini…";
  $("resultMeta").textContent = "Waiting for provider response";
  try {
    const requestBody = body.scenario === "spend-spike" && activeSpendSpike
      ? { scenario: "spend-spike", scenarioRunId: activeSpendSpike.scenarioRunId }
      : body;
    const response = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
    const result = await response.json();
    if (!response.ok && ["SPEND_SPIKE_RUN_UNAVAILABLE", "SPEND_SPIKE_RUN_NOT_RESUMABLE"].includes(result.code)) {
      activeSpendSpike = null;
      localStorage.removeItem(spendSpikeStorageKey);
      sessionStorage.removeItem(spendSpikeStorageKey);
      spendSpikeRecoveryRequired = true;
      $("output").textContent = result.error || "The baseline is unavailable. No Gemini requests were sent.";
      $("resultMeta").textContent = "Recovery required · provider calls: 0 · click Start fresh baseline to continue.";
      return;
    }
    if (!response.ok) throw new Error(result.error || "Request failed");
    if (result.scenario === "spend-spike" && result.stage === "baseline_ready") {
      activeSpendSpike = { scenarioRunId: result.scenarioRunId, readyAt: result.readyAt };
      spendSpikeRecoveryRequired = false;
      localStorage.setItem(spendSpikeStorageKey, JSON.stringify(activeSpendSpike));
      sessionStorage.removeItem(spendSpikeStorageKey);
    } else if (result.scenario === "spend-spike" && ["complete", "failed", "baseline_delivery_failed"].includes(result.stage)) {
      activeSpendSpike = null;
      spendSpikeRecoveryRequired = false;
      localStorage.removeItem(spendSpikeStorageKey);
      sessionStorage.removeItem(spendSpikeStorageKey);
    }
    const outputText = (result.outputs || []).map((o,i) => `Gemini response ${i+1} · ${o.featureId} · ${number(o.usage.totalTokens)} provider-reported tokens\n${String(o.text).slice(0, 700)}`).join("\n\n────────────────────────\n\n");
    const providerError = result.error ? `Provider error details: ${safeErrorText(result.error)}\n\n` : "";
    const eventsText = renderScenarioEvents(result.newEvents);
    $("output").textContent = `Scenario run ID: ${result.scenarioRunId || "not assigned"}\nStage: ${result.stage || "complete"}\n\n${providerError}${outputText}\n\nACLP event outcomes:\n${eventsText}`;
    $("resultMeta").textContent = summarizeStages(result);
    await refresh();
  } catch (error) { $("output").textContent = safeErrorText(error.message); $("resultMeta").textContent = "Provider or scenario request failed. The event list refreshes independently so persisted delivery outcomes remain visible."; await refresh(); }
  finally {
    scenarioRequestRunning = false;
    button.disabled = false;
    button.textContent = button.dataset.label;
    updateSpendSpikeButton(button);
  }
}
$("runFeature").addEventListener("click", (event) => run(event.currentTarget, { feature: features.value, text: $("input").value, scenario: "normal" }));
$("runScenario").addEventListener("click", (event) => run(event.currentTarget, { feature: features.value, text: $("input").value, scenario: scenario.value }));
$("refresh").addEventListener("click", refresh);

status(); refresh(); void restoreSpendSpikeRun(); setInterval(refresh, 5000);

// Chatbot functionality
let chatSessionId = null;
let chatMessages = []; // In-memory conversation history for the session

// Chatbot message rendering
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderChatMessage(role, content, isCurrent = false) {
  const container = document.createElement("div");
  container.className = `chat-message ${role} ${isCurrent ? "generating" : ""}`;

  const roleLabel = document.createElement("span");
  roleLabel.className = "role-label";
  roleLabel.textContent = role.charAt(0).toUpperCase() + role.slice(1);

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = escapeHtml(content);

  container.appendChild(roleLabel);
  container.appendChild(contentDiv);

  return container;
}

function appendChatMessage(role, content, isCurrent = false) {
  const messagesContainer = $("chatMessages");
  const message = renderChatMessage(role, content, isCurrent);
  messagesContainer.appendChild(message);

  // Auto-scroll to the latest message
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  if (!isCurrent) {
    chatMessages.push({ role, content });
  }
}

function clearChatMessages() {
  const messagesContainer = $("chatMessages");
  messagesContainer.innerHTML = "";
  chatMessages = [];
}

async function initializeChatSession() {
  try {
    const response = await fetch("/api/chat/session");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create session");
    }

    chatSessionId = data.sessionId;
    $("chatConnection").textContent = `Connected · ${chatSessionId.slice(0, 8)}`;
    $("chatConnection").className = "pill good";

    // Add welcome message
    clearChatMessages();
    appendChatMessage("assistant", "Hello! I'm your AI assistant. How can I help you today?");
  } catch (error) {
    $("chatConnection").textContent = "Connection failed";
    $("chatConnection").className = "pill bad";
    console.error("Chat session initialization error:", error);
  }
}

async function sendMessage(messageText) {
  if (!chatSessionId) {
    await initializeChatSession();
    if (!chatSessionId) return;
  }

  const trimmedMessage = messageText.trim();
  if (!trimmedMessage) return;

  // Add user message to UI
  appendChatMessage("user", trimmedMessage);

  const sendButton = $("sendChat");
  const inputField = $("chatInput");

  // Disable while processing
  sendButton.disabled = true;
  sendButton.textContent = "Sending…";

  try {
    const response = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: chatSessionId,
        message: trimmedMessage,
        maxTokens: 500
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to send message");
    }

    // Add assistant response
    appendChatMessage("assistant", data.text, false);

    // Update token counts in the UI
    if (data.usage) {
      const eventResponse = await fetch("/api/events");
      const eventData = await eventResponse.json();
      render(eventData);
    }

  } catch (error) {
    // Display error message in chat
    appendChatMessage("assistant", `Error: ${error.message || "Failed to get response. Please try again."}`);
  } finally {
    // Reset button state
    sendButton.disabled = false;
    sendButton.textContent = "Send";
    inputField.value = "";
    inputField.focus();
  }
}

function clearChat() {
  if (chatSessionId) {
    fetch(`/api/chat/session/${chatSessionId}`, { method: "DELETE" }).catch(() => {});
    chatSessionId = null;
  }
  clearChatMessages();
  initializeChatSession();
}

// Event listeners for chatbot
// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  await initializeChatSession();

  // Send button click
  $("sendChat").addEventListener("click", () => {
    const input = $("chatInput");
    sendMessage(input.value);
  });

  // Clear chat button
  $("clearChat").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearChat();
  });

  // Handle Enter/Shift+Enter in textarea
  $("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const input = $("chatInput");
      sendMessage(input.value);
    }
  });
});
