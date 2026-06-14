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
    const texFile = formData.get("texFile");
    if (!(texFile instanceof File)) {
      return errorResponse("LaTeXファイルが見つかりません。");
    }

    const username = cleanText(formData.get("username"), 40);
    const year = cleanText(formData.get("year"), 8);
    const era = cleanText(formData.get("era"), 20);
    const problemGroup = cleanProblemGroup(formData.get("problemGroup"));
    const title = cleanText(formData.get("title"), 120);
    const summary = cleanText(formData.get("summary"), 500);
    const detectedSections = Number(formData.get("detectedSections") || 0);

    if (!username || !year || !problemGroup || !title) {
      return errorResponse("ユーザー名、年度、問題区分、タイトルを入力してください。");
    }

    const texSource = await texFile.text();
    if (!texSource.trim()) {
      return errorResponse("LaTeXファイルが空です。");
    }

    const uploadedAt = new Date().toISOString();
    const id = `${year}-${problemGroup}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;
    const texPath = `exams/${year}/${problemGroup}/submissions/${id}/answer.tex`;

    const entry = {
      id,
      year: Number(year),
      era,
      problemGroup,
      title,
      summary,
      texPath,
      uploadedByName: username,
      uploadedByEmail: email,
      uploadedByUserId: user.id || "",
      uploadedAt,
      detectedSections,
      status: "submitted",
    };

    await putGitHubFile(texPath, texSource, `Add ${year} ${problemGroup} exam TeX by ${username}`);

    const manifest = await readManifest();
    const nextManifest = [
      entry,
      ...manifest.items.filter((item) => item.id !== id),
    ];

    await putGitHubFile(
      "exam-submissions.json",
      `${JSON.stringify(nextManifest, null, 2)}\n`,
      `Register ${year} ${problemGroup} exam submission by ${username}`,
      manifest.sha,
    );

    return jsonResponse({ entry });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "提出に失敗しました。", 500);
  }
});

async function readManifest(): Promise<{ items: Record<string, unknown>[]; sha?: string }> {
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
  const repository = Deno.env.get("GITHUB_REPOSITORY") || "warabimochi23/math-muscle-club";
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

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanProblemGroup(value: FormDataEntryValue | null) {
  return String(value || "A").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
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
