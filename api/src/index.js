require("./functions/upload");

const { app } = require("@azure/functions");

app.setup({
  enableHttpStream: true,
});