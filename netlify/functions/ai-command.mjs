export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Method Not Allowed"
      })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
const command = body.command || "";

console.log("Command:", command);
    console.log("AI Command:", body);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
     body: JSON.stringify({
  success: true,
  command,
  action: command ? "calendar_event" : "unknown",
  received: body
})
    };

  } catch (err) {
    console.error(err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
}