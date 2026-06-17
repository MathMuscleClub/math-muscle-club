import {
  errorResponse,
  handleOptions,
  jsonResponse,
  readAuthenticatedUser,
} from "../_shared/http.ts";

type GitHubFile = {
  content: string;
  sha: string;
};

type MacroCopyRule = {
  name: string;
  requiredArgs: number;
  optionalArgs?: boolean;
  maxOptionalArgs?: number;
};

type MacroAllowlist = {
  copyCommands: MacroCopyRule[];
};

type TexPart = {
  source: string;
  kind: "problem" | "answer";
  year: string;
  era: string;
  problemGroup: string;
  problemNumber: string;
  field: string;
  title: string;
  summary: string;
  tags: string[];
};

type ManifestItem = Record<string, unknown> & {
  id?: string;
  year?: string | number;
  era?: string;
  problemGroup?: string;
  problemNumber?: string;
  problemNumbers?: string[];
  filePath?: string;
  fileType?: "pdf" | "tex";
  field?: string;
  title?: string;
  summary?: string;
  problemTexPath?: string;
  answerTexPath?: string;
  texPath?: string;
  uploadedByName?: string;
  uploadedByEmail?: string;
  uploadedByUserId?: string;
  uploadedAt?: string;
  updatedAt?: string;
  tags?: string[];
  status?: string;
};

const DEFAULT_MACRO_ALLOWLIST: MacroAllowlist = {
  copyCommands: [
    { name: "DeclareMathOperator", requiredArgs: 2 },
    { name: "DeclareMathOperator*", requiredArgs: 2 },
    { name: "newcommand", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
    { name: "newcommand*", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
    { name: "providecommand", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
    { name: "providecommand*", requiredArgs: 2, optionalArgs: true, maxOptionalArgs: 2 },
  ],
};

function uncommentExamMacros(source: string): string {
  // 行頭にある「%」とそれに続くスペース、そして \exam... コマンドを、% なしの状態にする
  return source.replace(/^%[ \t]*(\\(?:exam\w+)[^\n]*)/gm, "$1");
}

function commentOutMetadataMacros(source: string): string {
  // \exam... から始まるメタデータマクロをコメントアウトする
  return source.replace(/^([ \t]*)(\\(?:exam\w+)[^\n]*)/gm, "$1% $2");
}

function buildStandaloneTex(body: string, sharedMacros: string): string {
  const commentedBody = commentOutMetadataMacros(body);
  const macrosSection = sharedMacros.trim()
    ? `\n% ── 共通数学マクロ定義 ──\n${sharedMacros.trim()}\n`
    : "";
  return `\\documentclass[12pt]{jlreq}
\\usepackage{amsmath, amssymb}
${macrosSection}
\\begin{document}

${commentedBody.trim()}

\\end{document}`;
}

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== "POST") {
    return errorResponse("POSTで送信してください。", 405);
  }

  try {
    const user = await readAuthenticatedUser(request);
    const email = String(user.email || "").toLowerCase();
    if (!isAllowedEmail(email)) {
      return errorResponse("このメールアドレスでは提出できません。", 403);
    }

    const formData = await request.formData();
    const username = cleanText(formData.get("username") || user.user_metadata?.username, 40);

    if (!username) {
      return errorResponse("ユーザー名を登録してください。");
    }

    const action = cleanText(formData.get("action"), 20);
    if (action === "delete") {
      return await deleteSubmission(formData, user, email, username);
    }
    if (action === "upload-pdf") {
      return await handlePdfUpload(formData, user, email, username);
    }
    if (action === "analyze-image-only") {
      return await handleAnalyzeImageOnly(formData, user, email, username);
    }
    if (action === "upload-image") {
      return await handleImageUpload(formData, user, email, username);
    }
    if (action === "upload-answer") {
      return await handleNewAnswerUpload(formData, user, email, username);
    }

    const rawProblemSource = await readTexInput(formData.get("problemTexFile"), formData.get("problemTexSource"));
    const rawAnswerSource = await readTexInput(formData.get("answerTexFile"), formData.get("answerTexSource"));
    const problemSource = uncommentExamMacros(rawProblemSource);
    const answerSource = uncommentExamMacros(rawAnswerSource);
    const replaceSubmissionId = cleanText(formData.get("replaceSubmissionId"), 160);
    if (!problemSource.trim() && !answerSource.trim()) {
      return errorResponse("問題文または解答のTeXを入力してください。");
    }
    if (containsProblemOnlyMetadata(answerSource)) {
      return errorResponse("解答TeXには \\examfield, \\examsubject, \\examtag を入れないでください。分野とタグは問題文TeXに入れてください。");
    }

    const macroAllowlist = await readMacroAllowlist();
    const problemParts = problemSource.trim() ? splitTexParts(problemSource, "problem", macroAllowlist).filter((part) => part.kind === "problem") : [];
    const answerParts = answerSource.trim() ? splitTexParts(answerSource, "answer", macroAllowlist).filter((part) => part.kind === "answer") : [];
    if (answerSource.trim() && answerParts.length === 0) {
      return errorResponse("解答LaTeXから提出対象を読み取れませんでした。");
    }
    if (replaceSubmissionId && answerParts.length !== 1) {
      return errorResponse("解答の編集では、解答TeXを1件だけ入力してください。");
    }

    const missingMetadata = [...problemParts, ...answerParts].find((part) => {
      return !part.year || !part.problemGroup || !part.problemNumber;
    });
    if (missingMetadata) {
      return errorResponse("\\examyear, \\examgroup, \\examnumber を各問題・解答ブロックに入れてください。");
    }
    const missingProblemField = problemParts.find((part) => !part.field);
    if (missingProblemField) {
      return errorResponse("問題文TeXには各問題ブロックに \\examfield を入れてください。");
    }
    if (findDuplicateTexPartKeys(problemParts).length > 0) {
      return errorResponse("同じ年度・問題区分・問題番号の問題文が同じアップロード内に複数あります。");
    }

    const uploadedAt = new Date().toISOString();
    const changedEntries: ManifestItem[] = [];
    const manifest = await readManifest();
    let nextManifest = manifest.items;

    for (const problemPart of problemParts) {
      const problemEntry = await saveSharedProblemPart(problemPart, nextManifest, user, email, username, uploadedAt);
      nextManifest = attachSharedProblemPath(nextManifest, problemPart, problemEntry.problemTexPath || "");
      nextManifest = upsertManifestItem(nextManifest, problemEntry);
      changedEntries.push(problemEntry);
    }

    if (replaceSubmissionId) {
      const replacementAnswer = answerParts[0];
      if (!replacementAnswer) {
        return errorResponse("編集する解答TeXが見つかりません。");
      }
      const updatedEntry = await updateAnswerSubmission(
        replaceSubmissionId,
        replacementAnswer,
        problemParts,
        nextManifest,
        user,
        email,
        username,
        uploadedAt,
      );
      nextManifest = upsertManifestItem(nextManifest, updatedEntry);
      changedEntries.push(updatedEntry);
    } else {
      for (const answerPart of answerParts) {
        const entry = await createAnswerSubmission(answerPart, problemParts, nextManifest, user, email, username, uploadedAt);
        nextManifest = upsertManifestItem(nextManifest, entry);
        changedEntries.push(entry);
      }
    }

    if (changedEntries.length === 0) {
      return errorResponse("更新する内容がありません。");
    }

    await putGitHubFile(
      "exam-submissions.json",
      `${JSON.stringify(nextManifest, null, 2)}\n`,
      replaceSubmissionId ? `Update exam submission by ${username}` : `Register exam submissions by ${username}`,
      manifest.sha,
    );

    return jsonResponse({ entries: changedEntries });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "提出に失敗しました。", 500);
  }
});

function cleanGeneratedLatex(text: string): string {
  let cleaned = text.trim();
  
  // Remove markdown code blocks
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    if (lines[0].startsWith("```")) {
      lines.shift();
    }
    if (lines[lines.length - 1].startsWith("```")) {
      lines.pop();
    }
    cleaned = lines.join("\n").trim();
  }
  
  return cleaned;
}

async function handlePdfUpload(
  formData: FormData,
  user: { id?: string },
  email: string,
  username: string,
) {
  const yearStr = cleanYear(formData.get("year"));
  const problemGroup = cleanProblemGroup(formData.get("problemGroup"));
  const problemNumbersStr = cleanText(formData.get("problemNumbers"), 200);
  const answerFile = formData.get("answerFile");

  if (!yearStr || !problemGroup) {
    return errorResponse("年度と問題区分を指定してください。");
  }
  if (!problemNumbersStr) {
    return errorResponse("解答が含まれる問題番号を選択してください。");
  }
  if (!(answerFile instanceof File) || answerFile.size === 0) {
    return errorResponse("PDFファイルを選択してください。");
  }

  const problemNumbers = problemNumbersStr.split(",").map(n => n.trim()).filter(Boolean);
  if (problemNumbers.length === 0) {
    return errorResponse("解答が含まれる問題番号を正しく選択してください。");
  }

  if (!answerFile.name.toLowerCase().endsWith(".pdf")) {
    return errorResponse("提出できるファイル形式は PDF (.pdf) のみです。");
  }

  const uploadedAt = new Date().toISOString();
  const safeGroup = cleanPathPart(problemGroup);
  const id = `${yearStr}-${safeGroup}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;
  const filePath = `exams/${yearStr}/${safeGroup}/submissions/${id}/answer.pdf`;

  const arrayBuffer = await answerFile.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64Content = encodeBase64Binary(bytes);
  await putGitHubBinaryFileEncoded(filePath, base64Content, `Add ${yearStr} ${safeGroup} answer PDF by ${username}`);

  const manifest = await readManifest();
  const entry: ManifestItem = {
    id,
    year: Number(yearStr),
    problemGroup,
    problemNumbers,
    filePath,
    fileType: "pdf",
    uploadedByName: username,
    uploadedByEmail: email,
    uploadedByUserId: user.id || "",
    uploadedAt,
    status: "submitted"
  };

  const nextManifest = upsertManifestItem(manifest.items, entry);
  await putGitHubFile(
    "exam-submissions.json",
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    `Register exam answer PDF by ${username}`,
    manifest.sha,
  );

  return jsonResponse({ entries: [entry] });
}

// ── Gemini モデル定義 ────────────────────────────────────
const GEMINI_MODELS: Record<string, string> = {
  "3.5-flash": "gemini-3.5-flash",
  "3.1-flash-lite": "gemini-3.1-flash-lite",
  "2.5-flash": "gemini-2.5-flash-preview-05-20",
  "2.5-flash-lite": "gemini-2.5-flash-lite-preview-06-17",
};
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

function resolveGeminiModel(modelKey: string | null): string {
  if (!modelKey) return DEFAULT_GEMINI_MODEL;
  return GEMINI_MODELS[modelKey.trim()] || DEFAULT_GEMINI_MODEL;
}

// 解答のTeXテンプレート型（プロンプトに渡す構造）
const ANSWER_TEX_TEMPLATE = `
% ===== 解答TeX テンプレート =====
% 以下の形式で出力してください：
%
% \\documentclass[12pt]{jlreq}
% \\usepackage{amsmath,amssymb,amsthm}
% \\theoremstyle{definition}
% \\newtheorem*{solution}{解答}
%
% \\begin{document}
%
% \\begin{solution}
% （解答内容）
% \\end{solution}
%
% \\end{document}
% ================================
`.trim();

const ANALYZE_PROMPT = `添付された画像は数学の答案用紙（解答）の写真です。
画像内のすべてのテキストと数式を正確に読み取り、以下の形式のコンパイル可能な LaTeX ドキュメントとして出力してください。

【出力形式】
\\documentclass[12pt]{jlreq}
\\usepackage{amsmath,amssymb,amsthm}
\\theoremstyle{definition}
\\newtheorem*{solution}{解答}

\\begin{document}

\\begin{solution}
（ここに解答内容を入れる。数式はすべて amsmath 記法で記述）
\\end{solution}

\\end{document}

【注意事項】
- 数式は必ず数式環境（\\( \\) または \\[ \\] または align 環境など）で囲む
- 日本語テキストはそのまま出力する
- 複数ページある場合はすべてのページの内容を1つのドキュメントに含める
- 出力は LaTeX コードのみとし、説明・挨拶・コードブロック記号（\`\`\`）は不要`;

async function callGeminiWithImages(
  apiKey: string,
  modelId: string,
  imageFiles: { base64: string; mimeType: string }[],
): Promise<{ latexCode: string; rateLimited: boolean; error?: string }> {
  const imageParts = imageFiles.map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 },
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: ANALYZE_PROMPT }, ...imageParts] }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  if (response.status === 429) {
    const errText = await response.text().catch(() => "");
    return {
      latexCode: "",
      rateLimited: true,
      error: `モデル「${modelId}」のレート制限に達しました。しばらく待ってから再試行するか、別のモデルをお試しください。詳細: ${errText.slice(0, 200)}`,
    };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    return {
      latexCode: "",
      rateLimited: false,
      error: `Gemini API エラー (${response.status}): ${errText.slice(0, 300)}`,
    };
  }

  const result = await response.json();
  const generatedText: string = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const latexCode = cleanGeneratedLatex(generatedText);

  return { latexCode, rateLimited: false };
}

async function handleAnalyzeImageOnly(
  formData: FormData,
  user: { id?: string },
  email: string,
  username: string,
) {
  const yearStr = cleanYear(formData.get("year"));
  const problemGroup = cleanProblemGroup(formData.get("problemGroup"));
  const problemNumbersStr = cleanText(formData.get("problemNumbers"), 200);
  const modelKey = cleanText(formData.get("geminiModel"), 40);

  if (!yearStr || !problemGroup) {
    return errorResponse("年度と問題区分を指定してください。");
  }
  if (!problemNumbersStr) {
    return errorResponse("解答が含まれる問題番号を選択してください。");
  }

  // 複数画像ファイルの取得
  const allFiles = formData.getAll("answerFile");
  const imageFiles = allFiles.filter(
    (f): f is File => f instanceof File && f.size > 0 && (f.type || "").startsWith("image/")
  );
  if (imageFiles.length === 0) {
    return errorResponse("画像ファイルを1枚以上選択してください。");
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return errorResponse("サーバー側の設定エラー: GEMINI_API_KEY が未設定です。");
  }

  const modelId = resolveGeminiModel(modelKey);

  // 全画像をbase64に変換
  const imageData = await Promise.all(imageFiles.map(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    return {
      base64: encodeBase64Binary(new Uint8Array(arrayBuffer)),
      mimeType: file.type || "image/jpeg",
    };
  }));

  try {
    const result = await callGeminiWithImages(geminiApiKey, modelId, imageData);

    if (result.rateLimited) {
      return errorResponse(result.error || "レート制限エラー", 429);
    }
    if (result.error) {
      return errorResponse(result.error, 502);
    }
    if (!result.latexCode.trim()) {
      return errorResponse("Geminiから有効なLaTeXコードが返されませんでした。");
    }

    return jsonResponse({ latexCode: result.latexCode, model: modelId, imageCount: imageFiles.length });
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return errorResponse(`画像の解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleImageUpload(
  formData: FormData,
  user: { id?: string },
  email: string,
  username: string,
) {
  const yearStr = cleanYear(formData.get("year"));
  const problemGroup = cleanProblemGroup(formData.get("problemGroup"));
  const problemNumbersStr = cleanText(formData.get("problemNumbers"), 200);
  const modelKey = cleanText(formData.get("geminiModel"), 40);

  if (!yearStr || !problemGroup) {
    return errorResponse("年度と問題区分を指定してください。");
  }
  if (!problemNumbersStr) {
    return errorResponse("解答が含まれる問題番号を選択してください。");
  }

  const problemNumbers = problemNumbersStr.split(",").map(n => n.trim()).filter(Boolean);
  if (problemNumbers.length === 0) {
    return errorResponse("解答が含まれる問題番号を正しく選択してください。");
  }

  // preconvertedTex が渡されている場合（フロントでプレビュー・編集済み）は Gemini をスキップ
  const preconvertedTex = String(formData.get("preconvertedTex") || "").slice(0, 200000);
  if (preconvertedTex && preconvertedTex.trim()) {
    const uploadedAt = new Date().toISOString();
    const safeGroup = cleanPathPart(problemGroup);
    const id = `${yearStr}-${safeGroup}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;
    const filePath = `exams/${yearStr}/${safeGroup}/submissions/${id}/answer.tex`;
    await putGitHubTextFile(filePath, preconvertedTex.trim(), `Add ${yearStr} ${safeGroup} answer TeX (reviewed from image) by ${username}`);
    const manifest = await readManifest();
    const entry: ManifestItem = {
      id,
      year: Number(yearStr),
      problemGroup,
      problemNumbers,
      filePath,
      fileType: "tex",
      uploadedByName: username,
      uploadedByEmail: email,
      uploadedByUserId: user.id || "",
      uploadedAt,
      status: "submitted"
    };
    const nextManifest = upsertManifestItem(manifest.items, entry);
    await putGitHubFile(
      "exam-submissions.json",
      `${JSON.stringify(nextManifest, null, 2)}\n`,
      `Register exam answer TeX (from image, reviewed) by ${username}`,
      manifest.sha,
    );
    return jsonResponse({ entries: [entry] });
  }

  // 複数画像ファイルの取得
  const allFiles = formData.getAll("answerFile");
  const imageFiles = allFiles.filter(
    (f): f is File => f instanceof File && f.size > 0 && (f.type || "").startsWith("image/")
  );
  if (imageFiles.length === 0) {
    return errorResponse("画像ファイルを1枚以上選択してください。");
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return errorResponse("サーバー側の設定エラー: GEMINI_API_KEY が未設定です。");
  }

  const modelId = resolveGeminiModel(modelKey);

  const imageData = await Promise.all(imageFiles.map(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    return {
      base64: encodeBase64Binary(new Uint8Array(arrayBuffer)),
      mimeType: file.type || "image/jpeg",
    };
  }));

  let latexCode = "";
  try {
    const result = await callGeminiWithImages(geminiApiKey, modelId, imageData);
    if (result.rateLimited) {
      return errorResponse(result.error || "レート制限エラー", 429);
    }
    if (result.error) {
      return errorResponse(result.error, 502);
    }
    if (!result.latexCode.trim()) {
      return errorResponse("Geminiから有効なLaTeXコードが返されませんでした。");
    }
    latexCode = result.latexCode;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return errorResponse(`画像の解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }

  const uploadedAt = new Date().toISOString();
  const safeGroup = cleanPathPart(problemGroup);
  const id = `${yearStr}-${safeGroup}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;
  const filePath = `exams/${yearStr}/${safeGroup}/submissions/${id}/answer.tex`;

  await putGitHubTextFile(filePath, latexCode, `Add ${yearStr} ${safeGroup} answer TeX (auto-generated by Gemini) by ${username}`);

  const manifest = await readManifest();
  const entry: ManifestItem = {
    id,
    year: Number(yearStr),
    problemGroup,
    problemNumbers,
    filePath,
    fileType: "tex",
    uploadedByName: username,
    uploadedByEmail: email,
    uploadedByUserId: user.id || "",
    uploadedAt,
    status: "submitted"
  };

  const nextManifest = upsertManifestItem(manifest.items, entry);
  await putGitHubFile(
    "exam-submissions.json",
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    `Register exam answer TeX (Gemini) by ${username}`,
    manifest.sha,
  );

  return jsonResponse({ entries: [entry] });
}

function encodeBase64Binary(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

async function putGitHubBinaryFileEncoded(path: string, base64Content: string, message: string) {
  const existing = await maybeGetGitHubFile(path);
  const response = await fetch(gitHubContentsUrl(path, false), {
    method: "PUT",
    headers: {
      ...gitHubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: gitHubBranch(),
      ...(existing?.sha ? { sha: existing.sha } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHubへの保存に失敗しました。${body}`);
  }
}

async function handleNewAnswerUpload(
  formData: FormData,
  user: { id?: string },
  email: string,
  username: string,
) {
  const yearStr = cleanYear(formData.get("year"));
  const problemGroup = cleanProblemGroup(formData.get("problemGroup"));
  const problemNumbersStr = cleanText(formData.get("problemNumbers"), 200);
  const answerFile = formData.get("answerFile");

  if (!yearStr || !problemGroup) {
    return errorResponse("年度と問題区分を指定してください。");
  }
  if (!problemNumbersStr) {
    return errorResponse("解答が含まれる問題番号を選択してください。");
  }
  if (!(answerFile instanceof File) || answerFile.size === 0) {
    return errorResponse("解答ファイルをアップロードしてください。");
  }

  const problemNumbers = problemNumbersStr.split(",").map(n => n.trim()).filter(Boolean);
  if (problemNumbers.length === 0) {
    return errorResponse("解答が含まれる問題番号を正しく選択してください。");
  }

  const fileName = answerFile.name.toLowerCase();
  const isPdf = fileName.endsWith(".pdf");
  const isTex = fileName.endsWith(".tex") || fileName.endsWith(".latex");

  if (!isPdf && !isTex) {
    return errorResponse("提出できるファイル形式は PDF (.pdf) または TeX (.tex, .latex) のみです。");
  }

  const fileType = isPdf ? "pdf" : "tex";
  const uploadedAt = new Date().toISOString();

  const safeGroup = cleanPathPart(problemGroup);
  const id = `${yearStr}-${safeGroup}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;

  const ext = isPdf ? "pdf" : "tex";
  const filePath = `exams/${yearStr}/${safeGroup}/submissions/${id}/answer.${ext}`;

  if (isPdf) {
    const arrayBuffer = await answerFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64Content = encodeBase64Binary(bytes);
    await putGitHubBinaryFileEncoded(filePath, base64Content, `Add ${yearStr} ${safeGroup} answer PDF by ${username}`);
  } else {
    const textContent = await answerFile.text();
    await putGitHubTextFile(filePath, textContent, `Add ${yearStr} ${safeGroup} answer TeX by ${username}`);
  }

  const manifest = await readManifest();
  const entry: ManifestItem = {
    id,
    year: Number(yearStr),
    problemGroup,
    problemNumbers,
    filePath,
    fileType,
    uploadedByName: username,
    uploadedByEmail: email,
    uploadedByUserId: user.id || "",
    uploadedAt,
    status: "submitted"
  };

  const nextManifest = upsertManifestItem(manifest.items, entry);
  await putGitHubFile(
    "exam-submissions.json",
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    `Register exam answer by ${username}`,
    manifest.sha,
  );

  return jsonResponse({ entries: [entry] });
}

async function readTexInput(fileValue: FormDataEntryValue | null, textValue: FormDataEntryValue | null) {
  if (fileValue instanceof File && fileValue.size > 0) {
    return await fileValue.text();
  }
  return String(textValue || "");
}

async function deleteSubmission(
  formData: FormData,
  user: { id?: string },
  email: string,
  username: string,
) {
  const submissionId = cleanText(formData.get("submissionId"), 160);
  if (!submissionId) return errorResponse("削除する解答が指定されていません。");

  const manifest = await readManifest();
  const target = manifest.items.find((item) => String(item.id || "") === submissionId);
  if (!target) return errorResponse("削除する解答が見つかりません。", 404);
  if (!canManageManifestItem(target, user, email)) {
    return errorResponse("この解答は投稿者本人だけ削除できます。", 403);
  }

  const answerTexPath = getAnswerTexPath(target);
  if (!answerTexPath) {
    return errorResponse("問題文は削除ではなく編集で更新してください。");
  }

  await deleteGitHubFileIfExists(answerTexPath, `Delete exam answer by ${username}`);

  const nextManifest = manifest.items.filter((item) => String(item.id || "") !== submissionId);
  await putGitHubFile(
    "exam-submissions.json",
    `${JSON.stringify(nextManifest, null, 2)}\n`,
    `Remove exam submission by ${username}`,
    manifest.sha,
  );

  return jsonResponse({ deletedId: submissionId });
}

async function saveSharedProblemPart(
  problemPart: TexPart,
  manifestItems: ManifestItem[],
  user: { id?: string },
  email: string,
  username: string,
  uploadedAt: string,
): Promise<ManifestItem> {
  const problemTexPath = sharedProblemTexPath(problemPart);
  await putGitHubTextFile(
    problemTexPath,
    problemPart.source,
    `Update ${problemPart.year} ${problemPart.problemGroup} ${problemPart.problemNumber} problem TeX`,
  );

  const existing = findProblemManifestEntry(manifestItems, problemPart);
  return {
    ...(existing || {}),
    id: sharedProblemEntryId(problemPart),
    year: Number(problemPart.year),
    era: problemPart.era || existing?.era || "",
    problemGroup: problemPart.problemGroup,
    problemNumber: problemPart.problemNumber,
    field: problemPart.field || existing?.field || "",
    title: problemPart.title || existing?.title || `${problemPart.year}年度 ${problemPart.problemGroup} 第${problemPart.problemNumber}問 問題文`,
    summary: problemPart.summary || existing?.summary || "",
    problemTexPath,
    uploadedByName: username,
    uploadedByEmail: email,
    uploadedByUserId: user.id || "",
    uploadedAt: existing?.uploadedAt || uploadedAt,
    updatedAt: uploadedAt,
    tags: uniqueValues([...(existing?.tags || []), ...(problemPart.tags || [])]),
    status: "problem",
  };
}

async function createAnswerSubmission(
  answerPart: TexPart,
  problemParts: TexPart[],
  manifestItems: ManifestItem[],
  user: { id?: string },
  email: string,
  username: string,
  uploadedAt: string,
): Promise<ManifestItem> {
  const problemPart = findMatchingProblemPart(problemParts, answerPart);
  const safeNumber = cleanPathPart(answerPart.problemNumber);
  const safeGroup = cleanPathPart(answerPart.problemGroup);
  const id = `${answerPart.year}-${safeGroup}-${safeNumber}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;
  const answerTexPath = defaultAnswerTexPath(answerPart, id);
  const problemTexPath = problemPart
    ? sharedProblemTexPath(problemPart)
    : findExistingProblemTexPath(manifestItems, answerPart);

  await putGitHubTextFile(
    answerTexPath,
    answerPart.source,
    `Add ${answerPart.year} ${safeGroup} ${safeNumber} answer TeX by ${username}`,
  );

  return {
    id,
    year: Number(answerPart.year),
    era: answerPart.era || problemPart?.era || "",
    problemGroup: answerPart.problemGroup,
    problemNumber: answerPart.problemNumber,
    title: answerPart.title || `${answerPart.year}年度 ${answerPart.problemGroup} 第${answerPart.problemNumber}問 解答`,
    summary: answerPart.summary || "",
    problemTexPath,
    answerTexPath,
    uploadedByName: username,
    uploadedByEmail: email,
    uploadedByUserId: user.id || "",
    uploadedAt,
    status: "submitted",
  };
}

async function updateAnswerSubmission(
  submissionId: string,
  answerPart: TexPart,
  problemParts: TexPart[],
  manifestItems: ManifestItem[],
  user: { id?: string },
  email: string,
  username: string,
  updatedAt: string,
): Promise<ManifestItem> {
  const target = manifestItems.find((item) => String(item.id || "") === submissionId);
  if (!target) throw new Error("編集する解答が見つかりません。");
  if (!canManageManifestItem(target, user, email)) {
    throw new Error("この解答は投稿者本人だけ編集できます。");
  }
  if (!matchesManifestProblem(target, answerPart)) {
    throw new Error("解答の編集では年度・問題区分・問題番号を変更できません。");
  }

  const answerTexPath = getAnswerTexPath(target) || defaultAnswerTexPath(answerPart, submissionId);
  const problemPart = findMatchingProblemPart(problemParts, answerPart);
  const problemTexPath = problemPart
    ? sharedProblemTexPath(problemPart)
    : findExistingProblemTexPath(manifestItems, answerPart) || String(target.problemTexPath || "");

  await putGitHubTextFile(
    answerTexPath,
    answerPart.source,
    `Update ${answerPart.year} ${answerPart.problemGroup} ${answerPart.problemNumber} answer TeX by ${username}`,
  );

  return {
    ...target,
    year: Number(answerPart.year),
    era: answerPart.era || target.era || problemPart?.era || "",
    problemGroup: answerPart.problemGroup,
    problemNumber: answerPart.problemNumber,
    field: undefined,
    title: answerPart.title || target.title || `${answerPart.year}年度 ${answerPart.problemGroup} 第${answerPart.problemNumber}問 解答`,
    summary: answerPart.summary || "",
    problemTexPath,
    answerTexPath,
    uploadedByName: target.uploadedByName || username,
    uploadedByEmail: target.uploadedByEmail || email,
    uploadedByUserId: target.uploadedByUserId || user.id || "",
    updatedAt,
    tags: undefined,
    status: "submitted",
  };
}

function sharedProblemEntryId(problemPart: TexPart) {
  return `${problemPart.year}-${cleanPathPart(problemPart.problemGroup)}-${cleanPathPart(problemPart.problemNumber)}-problem`;
}

function sharedProblemTexPath(problemPart: TexPart) {
  return `exams/${problemPart.year}/${cleanPathPart(problemPart.problemGroup)}/${cleanPathPart(problemPart.problemNumber)}/problem.tex`;
}

function defaultAnswerTexPath(answerPart: TexPart, id: string) {
  return `exams/${answerPart.year}/${cleanPathPart(answerPart.problemGroup)}/${cleanPathPart(answerPart.problemNumber)}/submissions/${id}/answer.tex`;
}

function upsertManifestItem(items: ManifestItem[], entry: ManifestItem) {
  return [
    entry,
    ...items.filter((item) => String(item.id || "") !== String(entry.id || "")),
  ];
}

function attachSharedProblemPath(items: ManifestItem[], problemPart: TexPart, problemTexPath: string) {
  if (!problemTexPath) return items;
  return items.map((item) => {
    if (!matchesManifestProblem(item, problemPart)) return item;
    return {
      ...item,
      problemTexPath,
    };
  });
}

function findProblemManifestEntry(items: ManifestItem[], problemPart: TexPart) {
  const problemId = sharedProblemEntryId(problemPart);
  return items.find((item) => String(item.id || "") === problemId)
    || items.find((item) => item.status === "problem" && matchesManifestProblem(item, problemPart));
}

function findExistingProblemTexPath(items: ManifestItem[], part: TexPart) {
  const item = items.find((candidate) => {
    return matchesManifestProblem(candidate, part) && String(candidate.problemTexPath || "");
  });
  return item ? String(item.problemTexPath || "") : "";
}

function getAnswerTexPath(item: ManifestItem) {
  return String(item.filePath || item.answerTexPath || item.texPath || "");
}

function canManageManifestItem(item: ManifestItem, user: { id?: string }, email: string) {
  const ownerId = String(item.uploadedByUserId || "");
  const ownerEmail = String(item.uploadedByEmail || "").toLowerCase();
  return Boolean((ownerId && ownerId === String(user.id || "")) || (ownerEmail && ownerEmail === email));
}

function matchesManifestProblem(item: ManifestItem, part: TexPart) {
  return String(item.year || "") === String(part.year || "")
    && cleanProblemGroup(item.problemGroup) === cleanProblemGroup(part.problemGroup)
    && cleanProblemNumber(item.problemNumber) === cleanProblemNumber(part.problemNumber);
}

function containsProblemOnlyMetadata(source: string) {
  return ["examfield", "examsubject", "examtag"].some((command) => hasTexCommand(source, command));
}

function hasTexCommand(source: string, command: string) {
  const needle = `\\${command}`;
  let index = 0;
  while ((index = source.indexOf(needle, index)) !== -1) {
    const next = source[index + needle.length] || "";
    if (!/[A-Za-z]/.test(next)) return true;
    index += needle.length;
  }
  return false;
}

function findDuplicateTexPartKeys(parts: TexPart[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const part of parts) {
    const key = `${part.year}:${part.problemGroup}:${part.problemNumber}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function splitTexParts(source: string, defaultKind: "problem" | "answer", macroAllowlist: MacroAllowlist): TexPart[] {
  const uncommented = uncommentExamMacros(source);
  const body = getDocumentBody(uncommented).replace(/\\maketitle/g, "").trim();
  const starts = findMetadataBlockStarts(body);
  const sharedMacros = extractSharedMacroPrefix(uncommented, body, starts, macroAllowlist);
  const ranges = starts.length > 0
    ? starts.map((start, index) => ({ start, end: starts[index + 1] ?? body.length }))
    : [{ start: 0, end: body.length }];

  return ranges.map(({ start, end }) => {
    const partBody = body.slice(start, end).trim();
    const metadata = parseExamMetadata(partBody, defaultKind);
    const partSource = buildStandaloneTex(partBody, sharedMacros);
    return {
      ...metadata,
      source: partSource,
    };
  }).filter((part) => part.source);
}

function extractSharedMacroPrefix(
  originalSource: string,
  body: string,
  starts: number[],
  macroAllowlist: MacroAllowlist,
) {
  const candidates = [
    getDocumentPreamble(originalSource),
    starts.length > 0 ? body.slice(0, starts[0]) : "",
  ].filter(Boolean);
  const declarations = candidates.flatMap((candidate) => collectAllowedMacroDeclarations(candidate, macroAllowlist));
  return uniqueMacroDeclarations(declarations).join("\n");
}

function prependSharedMacros(partSource: string, sharedMacros: string) {
  const source = partSource.trim();
  const macros = sharedMacros.trim();
  if (!source || !macros) return source;
  return `${macros}\n\n${source}`;
}

function collectAllowedMacroDeclarations(source: string, macroAllowlist: MacroAllowlist) {
  const rules = macroAllowlist.copyCommands
    .filter((rule) => rule.name && rule.requiredArgs > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const declarations: Array<{ start: number; end: number; text: string }> = [];

  for (const rule of rules) {
    const needle = `\\${rule.name}`;
    let index = 0;
    while ((index = source.indexOf(needle, index)) !== -1) {
      const next = source[index + needle.length] || "";
      if (/[A-Za-z]/.test(next) || (!rule.name.endsWith("*") && next === "*")) {
        index += needle.length;
        continue;
      }

      const declaration = readAllowedMacroDeclaration(source, index, rule);
      if (declaration) {
        declarations.push({ start: index, end: index + declaration.length, text: declaration });
        index += declaration.length;
      } else {
        index += needle.length;
      }
    }
  }

  return removeNestedMacroDeclarations(declarations.sort((a, b) => a.start - b.start))
    .map((item) => item.text);
}

function removeNestedMacroDeclarations(declarations: Array<{ start: number; end: number; text: string }>) {
  const selected: Array<{ start: number; end: number; text: string }> = [];
  for (const declaration of declarations) {
    const isNested = selected.some((item) => declaration.start >= item.start && declaration.end <= item.end);
    if (!isNested) selected.push(declaration);
  }
  return selected;
}

function readAllowedMacroDeclaration(source: string, start: number, rule: MacroCopyRule) {
  let cursor = start + rule.name.length + 1;
  let requiredRead = 0;
  let optionalRead = 0;
  const maxOptionalArgs = Math.max(0, rule.maxOptionalArgs ?? 0);

  while (cursor < source.length) {
    cursor = skipInlineSpace(source, cursor);

    if (rule.optionalArgs && optionalRead < maxOptionalArgs && source[cursor] === "[") {
      const bracketed = readBracketed(source, cursor);
      if (!bracketed) return "";
      cursor = bracketed.end;
      optionalRead++;
      continue;
    }

    if (source[cursor] === "{") {
      const braced = readBraced(source, cursor);
      if (!braced) return "";
      cursor = braced.end;
      requiredRead++;
      if (requiredRead >= rule.requiredArgs) break;
      continue;
    }

    return "";
  }

  if (requiredRead < rule.requiredArgs) return "";
  return source.slice(start, cursor).trim();
}

function skipInlineSpace(source: string, start: number) {
  let cursor = start;
  while (/[ \t\r\n]/.test(source[cursor] || "")) cursor++;
  return cursor;
}

function readBracketed(source: string, start: number) {
  let depth = 0;

  for (let index = start; index < source.length; index++) {
    const char = source[index];
    const escaped = index > 0 && source[index - 1] === "\\";

    if (char === "[" && !escaped) {
      depth++;
    } else if (char === "]" && !escaped) {
      depth--;
      if (depth === 0) {
        return {
          value: source.slice(start + 1, index),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function uniqueMacroDeclarations(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function findMetadataBlockStarts(source: string) {
  const commands = collectMetadataCommandMatches(source);
  if (commands.length === 0) return [];

  const yearStarts = commands.filter((item) => item.command === "examyear").map((item) => item.start);
  if (yearStarts.length > 1) return uniqueNumbers(yearStarts);

  const numberStarts = commands
    .filter((item) => item.command === "examnumber" || item.command === "examproblemnumber")
    .map((item) => item.start);
  if (numberStarts.length > 1) {
    return uniqueNumbers([commands[0].start, ...numberStarts.slice(1)]);
  }

  return [commands[0].start];
}

function parseExamMetadata(source: string, defaultKind: "problem" | "answer"): Omit<TexPart, "source"> {
  const read = (...names: string[]) => {
    for (const name of names) {
      const values = collectCommandArgs(source, name, 1);
      if (values.length > 0) return cleanTextValue(values[0].args[0], 120);
    }
    return "";
  };
  const kind = defaultKind;
  const isProblem = kind === "problem";

  return {
    kind,
    year: cleanYear(read("examyear")),
    era: cleanTextValue(read("examera"), 20),
    field: isProblem ? cleanTextValue(read("examfield", "examsubject"), 40) : "",
    problemGroup: cleanProblemGroup(read("examgroup", "examproblemgroup")),
    problemNumber: cleanProblemNumber(read("examnumber", "examproblemnumber")),
    title: cleanTextValue(read("examtitle"), 120),
    summary: cleanTextValue(read("examsummary"), 500),
    tags: isProblem
      ? uniqueValues(collectCommandArgs(source, "examtag", 1).map((item) => cleanTextValue(item.args[0], 40)))
      : [],
  };
}

function collectMetadataCommandMatches(source: string) {
  return [
    "examyear",
    "examera",
    "examfield",
    "examsubject",
    "examgroup",
    "examproblemgroup",
    "examnumber",
    "examproblemnumber",
    "examtitle",
    "examsummary",
    "examkind",
    "examtype",
  ].flatMap((command) => collectCommandArgs(source, command, 1).map((match) => ({
    ...match,
    command,
  }))).sort((a, b) => a.start - b.start);
}

function collectCommandArgs(source: string, command: string, arity: number) {
  const matches: Array<{ start: number; end: number; args: string[] }> = [];
  const needle = `\\${command}`;
  let index = 0;

  while ((index = source.indexOf(needle, index)) !== -1) {
    const next = source[index + needle.length] || "";
    if (/[A-Za-z]/.test(next)) {
      index += needle.length;
      continue;
    }

    const parsed = readArgs(source, index + needle.length, arity);
    if (parsed) {
      matches.push({ start: index, end: parsed.end, args: parsed.args });
      index = parsed.end;
    } else {
      index += needle.length;
    }
  }

  return matches;
}

function readArgs(source: string, start: number, arity: number) {
  const args: string[] = [];
  let cursor = start;

  for (let i = 0; i < arity; i++) {
    while (/\s/.test(source[cursor] || "")) cursor++;
    if (source[cursor] !== "{") return null;

    const braced = readBraced(source, cursor);
    if (!braced) return null;
    args.push(braced.value);
    cursor = braced.end;
  }

  return { args, end: cursor };
}

function readBraced(source: string, start: number) {
  let depth = 0;

  for (let index = start; index < source.length; index++) {
    const char = source[index];
    const escaped = index > 0 && source[index - 1] === "\\";

    if (char === "{" && !escaped) {
      depth++;
    } else if (char === "}" && !escaped) {
      depth--;
      if (depth === 0) {
        return {
          value: source.slice(start + 1, index),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function getDocumentBody(source: string) {
  const begin = "\\begin{document}";
  const end = "\\end{document}";
  const bodyStart = source.indexOf(begin);
  const bodyEnd = source.indexOf(end);
  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
    return source;
  }
  return source.slice(bodyStart + begin.length, bodyEnd);
}

function getDocumentPreamble(source: string) {
  const begin = "\\begin{document}";
  const bodyStart = source.indexOf(begin);
  return bodyStart === -1 ? "" : source.slice(0, bodyStart);
}

function findMatchingProblemPart(problemParts: TexPart[], answerPart: TexPart) {
  return problemParts.find((problemPart) => {
    return problemPart.year === answerPart.year
      && problemPart.problemGroup === answerPart.problemGroup
      && problemPart.problemNumber === answerPart.problemNumber;
  });
}

async function readMacroAllowlist(): Promise<MacroAllowlist> {
  const path = Deno.env.get("EXAM_MACRO_ALLOWLIST_PATH") || "exam-macro-allowlist.json";
  const file = await maybeGetGitHubFile(path);
  if (!file) return DEFAULT_MACRO_ALLOWLIST;

  const parsed = JSON.parse(decodeBase64(file.content));
  const copyCommands = Array.isArray(parsed?.copyCommands)
    ? parsed.copyCommands.map(normalizeMacroCopyRule).filter((rule: MacroCopyRule | null): rule is MacroCopyRule => Boolean(rule))
    : [];
  if (copyCommands.length === 0) {
    throw new Error(`${path} に copyCommands を1件以上設定してください。`);
  }
  return { copyCommands };
}

function normalizeMacroCopyRule(rule: unknown): MacroCopyRule | null {
  if (!rule || typeof rule !== "object") return null;
  const item = rule as Record<string, unknown>;
  const name = String(item.name || "").replace(/^\\/, "").trim();
  const requiredArgs = Number(item.requiredArgs);
  if (!/^[A-Za-z]+\*?$/.test(name) || !Number.isInteger(requiredArgs) || requiredArgs <= 0 || requiredArgs > 9) {
    return null;
  }

  const maxOptionalArgs = Number(item.maxOptionalArgs ?? 0);
  return {
    name,
    requiredArgs,
    optionalArgs: Boolean(item.optionalArgs),
    maxOptionalArgs: Number.isInteger(maxOptionalArgs) && maxOptionalArgs > 0 ? Math.min(maxOptionalArgs, 9) : 0,
  };
}

async function readManifest(): Promise<{ items: ManifestItem[]; sha?: string }> {
  try {
    const file = await getGitHubFile("exam-submissions.json");
    const text = decodeBase64(file.content);
    const parsed = JSON.parse(text);
    return {
      items: Array.isArray(parsed) ? parsed : [],
      sha: file.sha,
    };
  } catch (_error) {
    return { items: [] };
  }
}

async function getGitHubFile(path: string): Promise<GitHubFile> {
  const response = await fetch(gitHubContentsUrl(path, true), {
    headers: gitHubHeaders(),
  });
  if (!response.ok) {
    throw new Error(`${path} をGitHubから取得できませんでした。`);
  }
  return response.json();
}

async function maybeGetGitHubFile(path: string): Promise<GitHubFile | null> {
  const response = await fetch(gitHubContentsUrl(path, true), {
    headers: gitHubHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${path} をGitHubから取得できませんでした。`);
  }
  return response.json();
}

async function putGitHubTextFile(path: string, content: string, message: string) {
  const existing = await maybeGetGitHubFile(path);
  await putGitHubFile(path, content, message, existing?.sha);
}

async function putGitHubFile(path: string, content: string, message: string, sha?: string) {
  const response = await fetch(gitHubContentsUrl(path, false), {
    method: "PUT",
    headers: {
      ...gitHubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: encodeBase64(content),
      branch: gitHubBranch(),
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHubへの保存に失敗しました。${body}`);
  }
}

async function deleteGitHubFileIfExists(path: string, message: string) {
  const existing = await maybeGetGitHubFile(path);
  if (!existing) return;

  const response = await fetch(gitHubContentsUrl(path, false), {
    method: "DELETE",
    headers: {
      ...gitHubHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      sha: existing.sha,
      branch: gitHubBranch(),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHubからの削除に失敗しました。${body}`);
  }
}

function gitHubContentsUrl(path: string, withRef: boolean) {
  const url = `https://api.github.com/repos/${gitHubRepository()}/contents/${encodePath(path)}`;
  return withRef ? `${url}?ref=${gitHubBranch()}` : url;
}

function gitHubHeaders() {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKENが設定されていません。");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function gitHubRepository() {
  const repository = Deno.env.get("GITHUB_REPOSITORY") || "MathMuscleClub/math-muscle-club";
  if (!repository.includes("/")) throw new Error("GITHUB_REPOSITORYは owner/repo の形で設定してください。");
  return repository;
}

function gitHubBranch() {
  return Deno.env.get("GITHUB_BRANCH") || "main";
}

function encodePath(path: string) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function isAllowedEmail(email: string) {
  const domains = (Deno.env.get("ALLOWED_EMAIL_DOMAINS") || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  const domain = email.split("@")[1] || "";
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanTextValue(value: unknown, maxLength: number) {
  return cleanText(value, maxLength);
}

function cleanYear(value: unknown) {
  return toHalfWidth(value).replace(/[^0-9]/g, "").slice(0, 4);
}

function cleanProblemGroup(value: unknown) {
  return toHalfWidth(value).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
}

function cleanProblemNumber(value: unknown) {
  return toHalfWidth(value)
    .replace(/\s+/g, "")
    .replace(/[–ー〜~]/g, "-")
    .replace(/^第/, "")
    .replace(/問$/, "")
    .replace(/[^0-9A-Za-z_-]/g, "")
    .trim()
    .slice(0, 24);
}

function cleanPathPart(value: unknown) {
  return String(value || "")
    .replace(/[^0-9A-Za-z_-]/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => cleanText(value, 80)).filter(Boolean))];
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function toHalfWidth(value: unknown) {
  return String(value || "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "user";
}

function dateSlug(value: string) {
  return value.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
