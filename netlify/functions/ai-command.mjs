export async function handler(event) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        success: false,
        message: "Method Not Allowed"
      })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    console.log("AI Command Received:", body);

    // Version 1 - just echo the command back
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        message: "AI command received successfully.",
        command: body
      })
    };

  } catch (err) {

    console.error(err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: err.message
      })
    };
  }
}