
const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");

app.http("upload", {
    methods: ["POST"],
    authLevel: "anonymous",
    handler: async (request, context) => {
        try {
            const connectionString =
                process.env.BLOB_STORAGE_CONNECTION_STRING;

            if (!connectionString) {
                return {
                    status: 500,
                    jsonBody: { error: "Storage configuration is missing." }
                };
            }

            const studentUid = request.headers.get("x-student-uid");
            const fileName = request.headers.get("x-file-name");
            const contentType = request.headers.get("content-type");

            if (!studentUid || !fileName || contentType !== "application/pdf") {
                return {
                    status: 400,
                    jsonBody: { error: "Missing student or PDF details." }
                };
            }

            const bytes = Buffer.from(await request.arrayBuffer());

            if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
                return {
                    status: 400,
                    jsonBody: { error: "PDF must be between 1 byte and 5 MB." }
                };
            }

            const service = BlobServiceClient.fromConnectionString(
                connectionString
            );

            const container = service.getContainerClient("assignments");
            await container.createIfNotExists();

            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const blobName =
                `${studentUid}/${Date.now()}-${safeName}`;

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
                jsonBody: { error: "PDF upload failed." }
            };
        }
    }
});
