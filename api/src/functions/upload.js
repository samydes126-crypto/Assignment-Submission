
const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { getFirebaseAdmin } = require("./firebaseAdmin");

app.http("upload", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {
      // Verify the Firebase login token.
      const authorization = request.headers.get("authorization") || "";
      const match = authorization.match(/^Bearer (.+)$/i);

      if (!match) {
        return {
          status: 401,
          jsonBody: { error: "Please sign in before uploading." }
        };
      }

      const admin = getFirebaseAdmin();
      const decodedToken = await admin.auth().verifyIdToken(match[1]);
      const studentUid = decodedToken.uid;

      // Validate PDF details.
      const fileName = request.headers.get("x-file-name") || "";
      const contentType = request.headers.get("content-type") || "";

      if (
        !fileName.toLowerCase().endsWith(".pdf") ||
        contentType.split(";")[0].trim() !== "application/pdf"
      ) {
        return {
          status: 400,
          jsonBody: { error: "Please upload a PDF file." }
        };
      }

      const bytes = Buffer.from(await request.arrayBuffer());

      if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
        return {
          status: 400,
          jsonBody: { error: "PDF must be between 1 byte and 5 MB." }
        };
      }

      // Connect to the private Azure Blob container.
      const connectionString =
        process.env.BLOB_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        return {
          status: 500,
          jsonBody: { error: "Storage configuration is missing." }
        };
      }

      const service =
        BlobServiceClient.fromConnectionString(connectionString);

      const container = service.getContainerClient("assignments");
      await container.createIfNotExists();

      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blobName = `${studentUid}/${Date.now()}-${safeName}`;
      const blob = container.getBlockBlobClient(blobName);

      await blob.uploadData(bytes, {
        blobHTTPHeaders: {
          blobContentType: "application/pdf",
          blobContentDisposition: "inline"
        }
      });

      return {
        status: 200,
        jsonBody: {
          message: "PDF uploaded successfully.",
          blobName
        }
      };
    } catch (error) {
      context.error("PDF upload failed.", error);

      return {
        status: 500,
        jsonBody: { error: "Upload failed. Check the API configuration." }
      };
    }
  }
});
