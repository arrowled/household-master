export async function handler(event) {
  try {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({
          error: "Method Not Allowed"
        })
      };
    }

    const body = JSON.parse(event.body);

    console.log("Calendar Request:", body);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Calendar function is working.",
        received: body
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message
      })
    };
  }
}