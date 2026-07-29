const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function getLocalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function extractOutputText(openAIResponse) {
  if (typeof openAIResponse.output_text === "string") {
    return openAIResponse.output_text;
  }

  for (const outputItem of openAIResponse.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        return contentItem.text;
      }
    }
  }

  return "";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      success: false,
      error: "Method Not Allowed"
    });
  }

  try {
    if (!OPENAI_API_KEY) {
      return jsonResponse(500, {
        success: false,
        error: "OPENAI_API_KEY is not configured."
      });
    }

    const body = JSON.parse(event.body || "{}");
    const command = String(body.command || "").trim();

    if (!command) {
      return jsonResponse(400, {
        success: false,
        error: "Enter a calendar command."
      });
    }

 const currentDateTime =
  body.currentDateTime || new Date().toISOString();

const timezone =
  body.timezone || "America/Chicago"; 

    console.log("AI calendar command:", command);
  console.log("Calendar reference time:", currentDateTime);
console.log("Calendar timezone:", timezone);

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",

          input: [
            {
              role: "system",
              content: `
You convert household calendar commands into structured calendar events.

The user's local timezone is ${timezone}.
The current local date and time reference is ${currentDateTime}.
Use this exact reference when interpreting phrases like "in 10 minutes" or "5 minutes from now."

Interpret relative dates such as:
- today
- tomorrow
- tonight
- Thursday
- next Thursday
- this weekend

Rules:
- Return one calendar event.
- Dates must use YYYY-MM-DD.
- Times must use 24-hour HH:MM format.
- Use null for time when no time was given.
- Set all_day to true when no time was provided.
- Do not invent a reminder unless the user requested one.
- Use null for reminder_minutes when no reminder was requested.
- Keep the title short and natural.
- Put extra details in notes.
- Choose the closest matching event_type.

Available event types:
meal, thaw, grocery, practice, birthday, bill,
appointment, school, custom, family.
              `.trim()
            },
{
  role: "user",
  content:
`Current local date/time: ${currentDateTime}
Timezone: ${timezone}

Calendar request:
${command}`
}
          ],

          text: {
            format: {
              type: "json_schema",
              name: "calendar_event",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: {
                    type: "string"
                  },
                  event_type: {
                    type: "string",
                    enum: [
                      "meal",
                      "thaw",
                      "grocery",
                      "practice",
                      "birthday",
                      "bill",
                      "appointment",
                      "school",
                      "custom",
                      "family"
                    ]
                  },
                  date: {
                    type: "string"
                  },
                  time: {
                    anyOf: [
                      {
                        type: "string"
                      },
                      {
                        type: "null"
                      }
                    ]
                  },
                  all_day: {
                    type: "boolean"
                  },
                  notes: {
                    type: "string"
                  },
                  reminder_minutes: {
                    anyOf: [
                      {
                        type: "integer"
                      },
                      {
                        type: "null"
                      }
                    ]
                  }
                },
                required: [
                  "title",
                  "event_type",
                  "date",
                  "time",
                  "all_day",
                  "notes",
                  "reminder_minutes"
                ]
              }
            }
          }
        })
      }
    );

    const responseData = await openAIResponse.json();

    if (!openAIResponse.ok) {
      console.error("OpenAI API error:", responseData);

      return jsonResponse(openAIResponse.status, {
        success: false,
        error:
          responseData?.error?.message ||
          "OpenAI could not process the command."
      });
    }

    const outputText = extractOutputText(responseData);

    if (!outputText) {
      console.error("No OpenAI output text:", responseData);

      return jsonResponse(500, {
        success: false,
        error: "The AI returned an empty response."
      });
    }

    const calendarEvent = JSON.parse(outputText);

    console.log("Parsed calendar event:", calendarEvent);

    return jsonResponse(200, {
      success: true,
      action: "calendar_event",
      command,
      event: calendarEvent
    });
  } catch (error) {
    console.error("AI command function failed:", error);

    return jsonResponse(500, {
      success: false,
      error: error.message || "Unexpected server error."
    });
  }
}