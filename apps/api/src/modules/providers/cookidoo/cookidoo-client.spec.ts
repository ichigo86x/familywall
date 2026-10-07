import { describe, expect, it } from "vitest";
import { CookidooClient, CookidooError, cookidooRecipeId, findIngredients, parseCookidooSite } from "./cookidoo-client";

const CIAM = "https://ciam.prod.cookidoo.vorwerk-digital.com";
const credentials = { serverUrl: "https://cookidoo.it/foundation/it-IT", username: "family@example.com", password: "secret-pass" };
// Wednesday 7 Oct 2026.
const NOW = Date.parse("2026-10-07T10:00:00Z");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const redirect = (location: string, cookie?: string) => {
  const headers = new Headers({ Location: location });
  if (cookie) {
    headers.append("Set-Cookie", `${cookie}; Path=/; HttpOnly`);
  }
  return new Response(null, { status: 302, headers });
};

/** Fake CIAM + Cookidoo backend implementing the login redirects and the "my week" endpoint. */
const fakeCookidoo = (options: { password?: string; weeks?: Record<string, unknown[]> } = {}) => {
  const calls: string[] = [];
  let state = "";
  let tokens = 0;

  const fetchImpl = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    calls.push(`${init.method ?? "GET"} ${url.origin}${url.pathname}`);

    if (input === `${CIAM}/.well-known/openid-configuration`) {
      return json({ authorization_endpoint: `${CIAM}/oauth2/authorize`, token_endpoint: `${CIAM}/oauth2/token` });
    }
    if (url.pathname === "/oauth2/authorize") {
      state = url.searchParams.get("state")!;
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("market")).toBe("it");
      return redirect("/login-page?lang=it-IT", "ciam_session=abc");
    }
    if (url.pathname === "/login-page") {
      expect(headers.get("cookie")).toContain("ciam_session=abc");
      return new Response('<form><input type="hidden" name="requestId" value="req-123"></form>', { status: 200 });
    }
    if (url.pathname === "/login-srv/login") {
      const form = new URLSearchParams(String(init.body));
      expect(form.get("requestId")).toBe("req-123");
      if (form.get("password") !== (options.password ?? "secret-pass")) {
        return new Response("<p>wrong</p>", { status: 200 });
      }
      return redirect(`/oauth2/callback?step=2`);
    }
    if (url.pathname === "/oauth2/callback") {
      return redirect(`com.vorwerk.cookidoo://code-grant?code=the-code&state=${state}`);
    }
    if (url.pathname === "/oauth2/token") {
      const form = new URLSearchParams(String(init.body));
      expect(form.get("client_id")).toBe("mobile-android");
      expect(form.get("code_verifier")).toBeTruthy();
      tokens += 1;
      return json({ access_token: `token-${tokens}`, refresh_token: "refresh", expires_in: 43200 });
    }
    if (url.pathname === "/planning/.well-known/home") {
      return json({ _links: { "planning:api-my-week-from-date": { href: "https://it.web.example/planning/{lang}/api/my-week/{dayKey}{?x}" } } });
    }
    const week = url.pathname.match(/^\/planning\/it-IT\/api\/my-week\/(\d{4}-\d{2}-\d{2})$/);
    if (week) {
      expect(headers.get("authorization")).toBe(`Bearer token-${tokens}`);
      return json({ myDays: options.weeks?.[week[1]!] ?? [] });
    }
    return new Response("not found", { status: 404 });
  };

  return { fetchImpl, calls };
};

describe("parseCookidooSite", () => {
  it("derives market and language from the localized URL", () => {
    expect(parseCookidooSite("https://cookidoo.it/foundation/it-IT")).toEqual({ origin: "https://cookidoo.it", language: "it-IT", market: "it" });
    expect(parseCookidooSite("https://cookidoo.ch/foundation/de-CH").market).toBe("ch");
    expect(parseCookidooSite("https://cookidoo.co.uk/foundation/en-GB").market).toBe("ie");
  });
});

describe("CookidooClient", () => {
  it("signs in with PKCE and returns planned recipes as all-day events", async () => {
    const fake = fakeCookidoo({
      weeks: {
        "2026-10-05": [
          { dayKey: "2026-10-06", recipes: [{ id: "r1", title: "Risotto alla zucca" }] },
          { dayKey: "2026-10-08", recipes: [{ id: "r2", title: "Pane in cassetta" }, { id: "r3", title: "Crema pasticcera" }] }
        ]
      }
    });
    const client = new CookidooClient(fake.fetchImpl, 5000, () => NOW);

    const events = await client.fetchMealPlan(credentials, new Date("2026-10-05T00:00:00Z"), new Date("2026-10-12T00:00:00Z"));

    expect(events.map((event) => [event.startAt.slice(0, 10), event.title, event.allDay])).toEqual([
      ["2026-10-06", "Risotto alla zucca", true],
      ["2026-10-08", "Pane in cassetta", true],
      ["2026-10-08", "Crema pasticcera", true]
    ]);
    expect(events[0]).toMatchObject({ uid: "cookidoo-2026-10-06-r1", endAt: "2026-10-07T00:00:00.000Z" });
  });

  it("reuses the session and caches weeks between refreshes", async () => {
    const fake = fakeCookidoo();
    const client = new CookidooClient(fake.fetchImpl, 5000, () => NOW);
    const range = [new Date("2026-10-05T00:00:00Z"), new Date("2026-10-19T00:00:00Z")] as const;

    await client.fetchMealPlan(credentials, ...range);
    await client.fetchMealPlan(credentials, ...range);

    expect(fake.calls.filter((call) => call.endsWith("/login-srv/login"))).toHaveLength(1);
    expect(fake.calls.filter((call) => call.includes("/api/my-week/"))).toHaveLength(2);
  });

  it("only reads weeks near today, whatever the requested range", async () => {
    const fake = fakeCookidoo();
    const client = new CookidooClient(fake.fetchImpl, 5000, () => NOW);

    await client.fetchMealPlan(credentials, new Date("2026-01-01T00:00:00Z"), new Date("2027-01-31T00:00:00Z"));

    expect(fake.calls.filter((call) => call.includes("/api/my-week/")).length).toBeLessThanOrEqual(15);
  });

  it("reports wrong credentials as an auth error", async () => {
    const client = new CookidooClient(fakeCookidoo({ password: "other" }).fetchImpl, 5000, () => NOW);

    await expect(client.verify(credentials)).rejects.toBeInstanceOf(CookidooError);
    await expect(client.verify(credentials)).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("Cookidoo recipe ingredients", () => {
  it("reads recipe ids and ingredients from app data or schema.org data", () => {
    expect(cookidooRecipeId("cookidoo-2026-10-07-r59322")).toBe("r59322");
    expect(cookidooRecipeId("abc")).toBeNull();
    expect(
      findIngredients({
        recipeIngredientGroups: [{ recipeIngredients: [{ ingredientNotation: "farina", quantity: { value: 200 }, unitNotation: "g" }, { ingredientNotation: "sale" }] }]
      })
    ).toEqual(["200 g farina", "sale"]);
    expect(findIngredients([{ "@type": "Recipe", recipeIngredient: ["2 uova", " 100 g zucchero "] }])).toEqual(["2 uova", "100 g zucchero"]);
  });
});
