import {
  errorResponse,
  handleOptions,
  jsonResponse,
} from "../_shared/http.ts";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

Deno.serve(async (request) => {
  // CORSプリフライト要求の処理
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== "POST") {
    return errorResponse("POSTで送信してください。", 405);
  }

  try {
    const { chatHistory, systemPrompt, temperature, responseMimeType } = await request.json();

    if (!chatHistory || !Array.isArray(chatHistory)) {
      return errorResponse("有効な対話履歴 (chatHistory) を送信してください。");
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return errorResponse("サーバー側の設定エラー: GEMINI_API_KEY が未設定です。");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

    const requestBody: Record<string, unknown> = {
      contents: chatHistory,
      generationConfig: {
        temperature: temperature ?? 0.7,
        maxOutputTokens: 1500,
      }
    };

    if (systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    if (responseMimeType) {
      requestBody.generationConfig = {
        ...((requestBody.generationConfig as Record<string, unknown>) || {}),
        responseMimeType: responseMimeType
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 429) {
      const errText = await response.text().catch(() => "");
      return errorResponse(
        `Gemini API のレート制限に達しました。しばらく待ってから再試行してください。詳細: ${errText.slice(0, 200)}`,
        429
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return errorResponse(`Gemini API エラー (${response.status}): ${errText.slice(0, 300)}`, 502);
    }

    const result = await response.json();
    const replyText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return jsonResponse({ text: replyText });

  } catch (error) {
    console.error("oral-exam-chat Error:", error);
    return errorResponse(
      `リクエストの処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
});
