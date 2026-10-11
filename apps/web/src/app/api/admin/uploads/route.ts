import { imageUploadKinds } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { ApiError } from "@/server/api/errors";
import { uploadImage, type ImageKind } from "@/server/services/admin/uploads";
import { objectStore } from "@/server/storage";

// Multipart: `file` and `kind` (cover, badge or thumbnail). Written by the server only.
export const POST = adminRoute(
  {
    name: "POST /admin/uploads",
    mutation: true,
    status: 201,
    handler: async ({ req, audit }) => {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      const kind = String(form?.get("kind") ?? "");
      if (!(file instanceof File) || !(imageUploadKinds as readonly string[]).includes(kind)) {
        throw new ApiError(
          400,
          "validation_failed",
          "Send a file and a kind: cover, badge or thumbnail.",
        );
      }
      return uploadImage(
        objectStore(),
        kind as ImageKind,
        { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name },
        audit,
      );
    },
  },
  adminDeps,
);
