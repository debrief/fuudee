/** The webview messages' schema validator, compiled when the playground is built (scripts/messagevalidator.mjs). */
declare module "debrief-webview-message-validator" {
  const validate: ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };
  export default validate;
}
