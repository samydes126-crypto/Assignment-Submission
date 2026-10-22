const { app } = require("@azure/functions");

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => ({
    status: 200,
    jsonBody: { status: "API is working" }
  })
});