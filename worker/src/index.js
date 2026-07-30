const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    merk: { type: "string", description: "Automerk, bv. Ferrari" },
    model: { type: "string", description: "Modelnaam, bv. 488 GTB" },
    motor: { type: "string", description: "Motorbeschrijving, bv. V8 Biturbo 3.9L" },
    pk: { type: "string", description: "Geschat vermogen in PK, als getal in tekstvorm" },
    waarde_schatting: { type: "string", description: "Geschatte marktwaarde in euro, bv. '€ 200.000 - 250.000'" },
    zeldzaamheid: {
      type: "string",
      enum: ["Zie ik vaak", "Af en toe", "Zeldzaam", "Nog nooit gezien"],
      description: "Hoe zeldzaam dit model wereldwijd/op straat is",
    },
    toelichting: { type: "string", description: "Korte toelichting of onzekerheid, max 1-2 zinnen" },
  },
  required: ["merk", "model", "motor", "pk", "waarde_schatting", "zeldzaamheid", "toelichting"],
  additionalProperties: false,
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Ongeldige JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const { image, media_type } = body;
    if (!image || typeof image !== "string") {
      return new Response(JSON.stringify({ error: "Veld 'image' (base64) ontbreekt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
    if (!ALLOWED_MEDIA_TYPES.includes(media_type)) {
      return new Response(JSON.stringify({ error: "Onbekend media_type" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        output_config: { effort: "medium", format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type, data: image } },
              {
                type: "text",
                text:
                  "Dit is een foto van een auto, gemaakt door een autospotter die vooral geïnteresseerd is in " +
                  "speciale/zeldzame auto's. Identificeer merk, model, motor, geschat vermogen (PK), geschatte " +
                  "marktwaarde en hoe zeldzaam dit model is om op straat tegen te komen. Als je iets niet zeker " +
                  "weet, geef je beste inschatting en vermeld de onzekerheid in de toelichting.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(JSON.stringify({ error: "AI-analyse mislukt", detail: errText }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const result = await anthropicResponse.json();

    if (result.stop_reason === "refusal") {
      return new Response(JSON.stringify({ error: "AI kon deze foto niet analyseren" }), {
        status: 422,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const textBlock = result.content?.find((b) => b.type === "text");
    if (!textBlock) {
      return new Response(JSON.stringify({ error: "Geen resultaat van AI ontvangen" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return new Response(JSON.stringify({ error: "Kon AI-resultaat niet verwerken" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
};
