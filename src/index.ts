import type { Probot } from "probot";
import { hasRequiredConfig } from "./config.js";
import pushHandler from "./handlers/pushHandler.js";
import prHandler from "./handlers/prHandler.js";
import labelHandler from "./handlers/labelHandler.js";
import reviewHandler from "./handlers/reviewHandler.js";

export default function app(app: Probot): void {
  const missing = hasRequiredConfig();
  if (missing.length > 0) {
    app.log.error(
      `Configuracao incompleta. Faltam variaveis: ${missing.join(", ")}. Copie .env.example para .env e preencha.`
    );
    return;
  }

  app.log.info("Mottainai PR Bot iniciado. Escutando webhooks da organizacao Mottainai-One...");

  pushHandler(app);
  prHandler(app);
  labelHandler(app);
  reviewHandler(app);
}
