// Changes to the JSON Schema made for json-schema-to-typescript only (generate.mjs); validation
// reads the schema as LinkML's generator wrote it.

/**
 * A property that is a $ref with keywords beside it (a required member's description) is read by
 * json-schema-to-typescript as a type of its own, a copy of the one referred to named with a
 * number (TrackEdit1). Written as anyOf the one $ref, the same schema, it names the type referred
 * to and keeps the description as the member's comment. Only the members of a discriminated
 * union's classes are changed, so no other type's name moves.
 */
export function refsWithoutSiblings(defs) {
  const out = structuredClone(defs);
  const members = Object.values(out).flatMap((def) => (def.discriminator && def.oneOf ? def.oneOf.map((o) => o.$ref.split("/").pop()) : []));
  for (const name of members) {
    for (const [key, property] of Object.entries(out[name].properties ?? {})) {
      if (!property.$ref || Object.keys(property).length === 1) continue;
      const { $ref, ...rest } = property;
      out[name].properties[key] = { ...rest, anyOf: [{ $ref }] };
    }
  }
  return out;
}
