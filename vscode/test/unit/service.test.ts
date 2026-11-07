import { describe, expect, it } from "vitest";
import { ToolService } from "../../src/service.js";

describe("the tool service's tools/list", () => {
  it("gives the Tools view only the libraries' tools, not the methods listed beside them", async () => {
    const declaration = { name: "core.range_rings", title: "Range rings" };
    const unavailable = [{ name: "lab", reason: "failed to load" }];
    const service = Object.create(ToolService.prototype) as unknown as { request: (method: string) => Promise<unknown>; listTools: ToolService["listTools"] };
    service.request = async (method: string) => {
      expect(method).toBe("tools/list");
      return {
        tools: [
          { name: "core.range_rings", _meta: { "debrief/declaration": declaration } },
          { name: "debrief.stores", inputSchema: { type: "object" }, _meta: { "debrief/method": { method: "debrief/stores", writes: false, agent: false, history: false } } },
        ],
        _meta: { "debrief/unavailable": unavailable },
      };
    };
    expect(await service.listTools()).toEqual({ tools: [declaration], unavailable });
  });
});
