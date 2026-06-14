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

type TexPart = {
  source: string;
  kind: "problem" | "answer";
  year: string;
  era: string;
  problemGroup: string;
  problemNumber: string;
  title: string;
  summary: string;
  tags: string[];
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
    const problemTexFile = formData.get("problemTexFile");
    const answerTexFile = formData.get("answerTexFile");
    if (!(answerTexFile instanceof File)) {
      return errorResponse("解答LaTeXファイルが見つかりません。");
    }

    const username = cleanText(formData.get("username") || user.user_metadata?.username, 40);

    if (!username) {
      return errorResponse("ユーザー名を登録してください。");
    }

    const problemSource = problemTexFile instanceof File ? await problemTexFile.text() : "";
    const answerSource = await answerTexFile.text();
    if (!answerSource.trim()) {
      return errorResponse("解答LaTeXファイルが空です。");
    }

    const problemParts = problemSource.trim() ? splitTexParts(problemSource, "problem") : [];
    const answerParts = splitTexParts(answerSource, "answer");
    if (answerParts.length === 0) {
      return errorResponse("解答LaTeXから提出対象を読み取れませんでした。");
    }

    const missingMetadata = [...problemParts, ...answerParts].find((part) => {
      return !part.year || !part.problemGroup || !part.problemNumber;
    });
    if (missingMetadata) {
      return errorResponse("\\examyear, \\examgroup, \\examnumber を各問題・解答ブロックに入れてください。");
    }

    const uploadedAt = new Date().toISOString();
    const entries = [];

    for (const answerPart of answerParts) {
      const problemPart = findMatchingProblemPart(problemParts, answerPart);
      const safeNumber = cleanPathPart(answerPart.problemNumber);
      const safeGroup = cleanPathPart(answerPart.problemGroup);
      const id = `${answerPart.year}-${safeGroup}-${safeNumber}-${dateSlug(uploadedAt)}-${slugify(username)}-${crypto.randomUUID().slice(0, 8)}`;
      const basePath = `exams/${answerPart.year}/${safeGroup}/${safeNumber}/submissions/${id}`;
      const answerTexPath = `${basePath}/answer.tex`;
      const problemTexPath = problemPart ? `${basePath}/problem.tex` : "";

      if (problemPart) {
        await putGitHubFile(problemTexPath, problemPart.source, `Add ${answerPart.year} ${safeGroup} ${safeNumber} problem TeX`);
      }
      await putGitHubFile(answerTexPath, answerPart.source, `Add ${answerPart.year} ${safeGroup} ${safeNumber} answer TeX by ${username}`);

      entries.push({
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
        tags: uniqueValues([...(answerPart.tags || []), ...(problemPart?.tags || [])]),
        status: "submitted",
      });
    }

    const manifest = await readManifest();
    const nextManifest = [
      ...entries,
      ...manifest.items.filter((item) => !entries.some((entry) => entry.id === item.id)),
    ];

    await putGitHubFile(
      "exam-submissions.json",
      `${JSON.stringify(nextManifest, null, 2)}\n`,
      `Register exam submissions by ${username}`,
      manifest.sha,
    );

    return jsonResponse({ entries });
  } catch (error) {
    console.error(error);
    return errorResponse(error instanceof Error ? error.message : "提出に失敗しました。", 500);
  }
});

function splitTexParts(source: string, defaultKind: "problem" | "answer"): TexPart[] {
  const body = getDocumentBody(source).replace(/\\maketitle/g, "").trim();
  const starts = findMetadataBlockStarts(body);
  const ranges = starts.length > 0
    ? starts.map((start, index) => ({ start, end: starts[index + 1] ?? body.length }))
    : [{ start: 0, end: body.length }];

  return ranges.map(({ start, end }) => {
    const partSource = body.slice(start, end).trim();
    const metadata = parseExamMetadata(partSource, defaultKind);
    return {
      ...metadata,
      source: partSource,
    };
  }).filter((part) => part.source);
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
  const kindText = read("examkind", "examtype");

  return {
    kind: normalizeKind(kindText, defaultKind),
    year: cleanYear(read("examyear")),
    era: cleanTextValue(read("examera"), 20),
    problemGroup: cleanProblemGroup(read("examgroup", "examproblemgroup")),
    problemNumber: cleanProblemNumber(read("examnumber", "examproblemnumber")),
    title: cleanTextValue(read("examtitle"), 120),
    summary: cleanTextValue(read("examsummary"), 500),
    tags: uniqueValues(collectCommandArgs(source, "examtag", 1).map((item) => cleanTextValue(item.args[0], 40))),
  };
}

function collectMetadataCommandMatches(source: string) {
  return [
    "examyear",
    "examera",
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

function findMatchingProblemPart(problemParts: TexPart[], answerPart: TexPart) {
  return problemParts.find((problemPart) => {
    return problemPart.year === answerPart.year
      && problemPart.problemGroup === answerPart.problemGroup
      && problemPart.problemNumber === answerPart.problemNumber;
  });
}

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

function normalizeKind(value: string, fallback: "problem" | "answer"): "problem" | "answer" {
  const text = cleanText(value, 30).toLowerCase();
  if (/問題|problem|question/.test(text)) return "problem";
  if (/解答|解説|答案|answer|solution/.test(text)) return "answer";
  return fallback;
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
