/** The text of package.json with its commands and menus replaced by these. */
export function withContribution(text: string, contribution: { commands: Record<string, unknown>[]; menus: Record<string, Record<string, unknown>[]> }): string;
