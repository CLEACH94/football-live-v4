module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "API_FOOTBALL_KEY is not configured"
    });
  }

  const endpoint =
    typeof req.query.endpoint === "string"
      ? req.query.endpoint
      : "fixtures";

  // Only allow the football endpoints our app needs
  const allowedEndpoints = [
    "fixtures",
    "leagues",
    "standings",
    "teams",
    "teams/statistics",
    "fixtures/headtohead"
  ];

  if (!allowedEndpoints.includes(endpoint)) {
    return res.status(400).json({
      error: "Endpoint not allowed"
    });
  }

  try {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query)) {
      if (key === "endpoint") continue;

      if (typeof value === "string") {
        params.append(key, value);
      }
    }

    const url =
      `https://v3.football.api-sports.io/${endpoint}` +
      (params.toString() ? `?${params.toString()}` : "");

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey
      }
    });

    const data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    return res.status(response.status).json(data);
  } catch (error) {
    console.error("API-Football proxy error:", error);

    return res.status(500).json({
      error: "Failed to contact API-Football"
    });
  }
};
