import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { setApiKey } from "@/lib/api/client";
import "@/index.css";

/**
 * The API key must be known BEFORE the first request leaves the window: the
 * embedded backend rejects every call without it ("Clé API invalide"). So the
 * launch info is resolved first, then React renders. In a plain browser tab
 * (dev) there is no bridge and the key stays null.
 */
async function bootstrap() {
  try {
    const info = await window.fuego?.getLaunchInfo();
    if (info?.apiKey) setApiKey(info.apiKey);
  } catch {
    // No bridge / bridge failure — render anyway, the API will answer 401
    // with a readable message instead of leaving a blank window.
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
