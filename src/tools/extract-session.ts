import { loadBundledPrompt } from "../utils.js";

export function createExtractSessionTool() {
  return {
    name: "extract_session",
    description:
      "Return Alexandria's session-extraction prompt for filing durable knowledge back into the wiki. Call this when the user asks to preserve, file, or extract what happened in the conversation — especially near the end of a long session on hosts without real session-end hooks. After applying the prompt, update the relevant wiki pages, append to log.md if something durable was filed, and call index_build.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      const prompt = loadBundledPrompt("session-end.md");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                prompt,
                nextSteps: [
                  "Search for existing pages before creating new ones.",
                  "Prefer updating existing pages over making duplicates.",
                  "Append a log entry only if durable knowledge was filed.",
                  "Run index_build after wiki edits so the next session sees them.",
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    },
  };
}
