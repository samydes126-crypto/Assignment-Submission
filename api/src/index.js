```javascript
const { app } = require("@azure/functions");

require("./functions/health");
require("./functions/upload");

app.setup({
  enableHttpStream: true
});
```