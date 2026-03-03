import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, to } = body.message.toolCalls[0].function.arguments;

    if (!message || !to) {
      return NextResponse.json({ error: "Missing required fields: 'message' and 'to'" }, { status: 400 });
    }

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_MESSAGING_SERVICE_SID) {
      console.error("Twilio credentials are not fully configured in the environment variables.");
      return NextResponse.json({ error: "Twilio integration is not configured." }, { status: 500 });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID);
    params.append('Body', message);

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
      },
      body: params.toString()
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error("Twilio API Error:", twilioData);
      return NextResponse.json(
        { results: [{ toolCallId: body.message.toolCalls[0].id, result: `Failed to send SMS to ${to}. Tell the user the message failed to send.` }] }
      );
    }

    console.log(`Successfully sent SMS to ${to}. SID: ${twilioData.sid}`);
    
    // Vapi requires tools to return a specific JSON RPC format.
    return NextResponse.json({
      results: [{
        toolCallId: body.message.toolCalls[0].id,
        result: `Successfully sent SMS to ${to}. Tell the user the message was sent successfully.`
      }]
    });

  } catch (error) {
    console.error("Error processing send-sms tool action:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
