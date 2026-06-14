import {
  corsHeaders,
  errorResponse,
  handleOptions,
  jsonResponse,
} from "../_shared/http.ts";

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== "POST") {
    return errorResponse("POSTで送信してください。", 405);
  }

  try {
    const payload = await request.json();
    const rendererUrl = Deno.env.get("PDF_RENDERER_URL");
    if (!rendererUrl) {
      return jsonResponse({
        message: "PDF_RENDERER_URLが未設定です。サイト側は印刷画面の一時生成にフォールバックします。",
      }, 501);
    }

    const rendererResponse = await fetch(rendererUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(Deno.env.get("PDF_RENDERER_TOKEN")
          ? { Authorization: `Bearer ${Deno.env.get("PDF_RENDERER_TOKEN")}` }
          : {}),
      },
      body: JSON.stringify({
        ...payload,
        repository: Deno.env.get("GITHUB_REPOSITORY") || "MathMuscleClub/math-muscle-club",
        branch: Deno.env.get("GITHUB_BRANCH") || "main",
        manifestPath: "exam-submissions.json",
      }),
    });

    if (!rendererResponse.ok) {
      const text = await rendererResponse.text();
      return errorResponse(text || "PDF生成に失敗しました。", rendererResponse.status);
    }

    return new Response(rendererResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${makePdfFileName(payload)}"`,
      },
    });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "PDF生成に失敗しました。", 500);
  }
});

function makePdfFileName(payload: Record<string, unknown>) {
  const year = String(payload.year || "exam").replace(/[^A-Za-z0-9_-]/g, "");
  const group = String(payload.problemGroup || "all").replace(/[^A-Za-z0-9_-]/g, "");
  const mode = String(payload.mode || "problems-and-answers").replace(/[^A-Za-z0-9_-]/g, "");
  return `${year}-${group}-${mode}.pdf`;
}
