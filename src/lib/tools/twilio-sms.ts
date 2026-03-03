export const sendSmsTool = {
  async: true,
  messages: [
    {
      type: "request-start",
      content: "I'm sending the SMS right now.",
    },
    {
      type: "request-complete",
      content: "The SMS has been sent.",
    },
    {
      type: "request-failed",
      content: "I'm sorry, there was a problem sending the SMS.",
    }
  ],
  type: "tool",
  function: {
    name: "sendSms",
    description: "Sends an SMS text message to a specified phone number. You must use this when the user asks to send a text or an SMS.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "The destination phone number to send the SMS to, formatted in E.164 (e.g., +14155552671)."
        },
        message: {
          type: "string",
          description: "The content of the text message to send."
        }
      },
      required: ["to", "message"]
    }
  },
  server: {
    url: `${process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')}/api/tools/send-sms`
  }
};
