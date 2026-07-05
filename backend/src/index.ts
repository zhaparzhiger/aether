import { app } from "./app";
import { env } from "./config/env";
import { recoverStuckDocuments } from "./services/documentProcessor";

app.listen(env.port, () => {
  console.log(`Aether API listening on http://localhost:${env.port}`);
  recoverStuckDocuments().catch((err) => console.error("Stuck document recovery failed:", err));
});
