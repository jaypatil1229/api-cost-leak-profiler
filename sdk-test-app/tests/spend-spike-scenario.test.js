import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPEND_SPIKE_BASELINE_WAIT_MS,
  SPEND_SPIKE_CALLS,
  SPEND_SPIKE_DETECTOR_WINDOW_MS,
  SPEND_SPIKE_SOURCE_CHAR_COUNT,
  expandSpendSpikeSource,
  spendSpikeBaselineWindow,
} from "../spend-spike-scenario.js";

describe("Spend Spike scenario window contract", () => {
  it("keeps a real 15-minute-old baseline in a comparison window at the next two 5-minute detector ticks", () => {
    const baselineAt = 0;
    const spikeStartsAt = baselineAt + SPEND_SPIKE_BASELINE_WAIT_MS;

    assert.equal(spendSpikeBaselineWindow(baselineAt, spikeStartsAt + 5 * 60_000), "immediate-previous");
    assert.equal(spendSpikeBaselineWindow(baselineAt, spikeStartsAt + 10 * 60_000), "two-windows-ago");
    assert.equal(SPEND_SPIKE_DETECTOR_WINDOW_MS, 10 * 60_000);
  });

  it("rejects a baseline outside both comparison windows", () => {
    const baselineAt = 0;
    const spikeStartsAt = baselineAt + SPEND_SPIKE_BASELINE_WAIT_MS;

    assert.equal(spendSpikeBaselineWindow(baselineAt, spikeStartsAt + 20 * 60_000), null);
  });

  it("expands short notes into a large real provider prompt without estimating token usage", () => {
    const material = expandSpendSpikeSource("short real source notes");

    assert.equal(SPEND_SPIKE_CALLS, 10);
    assert.equal(material.length, SPEND_SPIKE_SOURCE_CHAR_COUNT);
    assert.ok(material.startsWith("short real source notes"));
  });

  it("does not alter an already supplied full-size source", () => {
    const source = "x".repeat(SPEND_SPIKE_SOURCE_CHAR_COUNT + 5);

    assert.equal(expandSpendSpikeSource(source).length, SPEND_SPIKE_SOURCE_CHAR_COUNT);
    assert.equal(expandSpendSpikeSource(source), source.slice(0, SPEND_SPIKE_SOURCE_CHAR_COUNT));
  });
});
