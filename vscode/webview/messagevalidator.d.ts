/** The webview messages' schema validator, compiled when the pages are built (scripts/messagevalidator.mjs). */
declare module "debrief-webview-message-validator" {
  const validate: ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };
  export default validate;
}
