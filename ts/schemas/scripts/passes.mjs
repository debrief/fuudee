// Changes to the JSON Schema made for json-schema-to-typescript only (generate.mjs); validation
// reads the schema as LinkML's generator wrote it.

/**
 * A property that is a $ref with keywords beside it (a required member's description) is read by
 * json-schema-to-typescript as a type of its own, a copy of the one referred to named with a
 * number (TrackEdit1). Written as anyOf the one $ref, the same schema, it names the type referred
 * to and keeps the description as the member's comment. Every class's members are changed, so
 * a type is named once (AgentRef, never AgentRef3), whichever class's member it is: the tool
 * service's parameters and replies (rpc.yaml) refer to the same few classes from many.
 */
export function refsWithoutSiblings(defs) {
  const out = structuredClone(defs);
  for (const name of Object.keys(out)) {
    for (const [key, property] of Object.entries(out[name].properties ?? {})) {
      if (!property.$ref || Object.keys(property).length === 1) continue;
      const { $ref, ...rest } = property;
      out[name].properties[key] = { ...rest, anyOf: [{ $ref }] };
    }
  }
  return out;
}
