import { describe, expect, it } from "vitest";
import { requestPrint } from "./client";

describe("envoi d'une impression depuis le navigateur", () => {
  it("transforme une panne réseau ou une page d'erreur en message", async () => {
    const offline = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await requestPrint({}, offline)).toEqual({ error: "Connexion perdue : réessayez." });

    const crash = (async () => new Response("<html>Internal Server Error</html>", { status: 500 })) as unknown as typeof fetch;
    expect((await requestPrint({}, crash)).error).toMatch(/500/);
  });

  it("renvoie la réponse du serveur, erreurs métier comprises", async () => {
    const limit = (async () => Response.json({ error: "Quota atteint" }, { status: 402 })) as unknown as typeof fetch;
    expect(await requestPrint({}, limit)).toEqual({ error: "Quota atteint" });
  });
});
