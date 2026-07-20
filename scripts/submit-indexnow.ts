import nextEnv from "@next/env";
import sitemap from "../app/sitemap";
import { parseIndexNowKey } from "../lib/indexnow";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const { loadEnvConfig } = nextEnv;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getSubmissionUrls() {
  const urlList = [...new Set(sitemap().map((entry) => entry.url))];

  if (urlList.length === 0) {
    throw new Error("app/sitemap.ts did not return any public URLs.");
  }

  const site = new URL(urlList[0]);

  for (const value of urlList) {
    const url = new URL(value);
    if (url.origin !== site.origin) {
      throw new Error(`Sitemap URL ${value} does not belong to ${site.origin}.`);
    }
  }

  return {
    host: site.hostname,
    keyLocationBase: site.origin,
    urlList,
  };
}

async function responseDetails(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/plain")) {
    return "";
  }

  const body = (await response.text()).replace(/\s+/g, " ").trim();
  return body ? `: ${body.slice(0, 500)}` : "";
}

async function verifyKeyLocation(key: string, keyLocation: string) {
  let response: Response;
  try {
    response = await fetch(keyLocation, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    throw new Error(`Key verification request failed: ${errorMessage(error)}`);
  }

  if (!response.ok) {
    throw new Error(
      `Key verification URL returned HTTP ${response.status} ${response.statusText}${await responseDetails(response)}`,
    );
  }

  const publishedKey = await response.text();
  if (publishedKey !== key) {
    throw new Error("Key verification URL content does not exactly match INDEXNOW_KEY.");
  }
}

async function submitIndexNow() {
  loadEnvConfig(process.cwd());

  const key = parseIndexNowKey(process.env.INDEXNOW_KEY);
  if (!key) {
    throw new Error(
      "INDEXNOW_KEY must contain 8-128 ASCII letters, numbers, or hyphens and must not include whitespace.",
    );
  }

  const { host, keyLocationBase, urlList } = getSubmissionUrls();
  const keyLocation = `${keyLocationBase}/${key}.txt`;

  await verifyKeyLocation(key, keyLocation);

  const batches = Math.ceil(urlList.length / MAX_URLS_PER_REQUEST);
  let validationPending = false;

  for (let index = 0; index < batches; index += 1) {
    const batch = urlList.slice(index * MAX_URLS_PER_REQUEST, (index + 1) * MAX_URLS_PER_REQUEST);
    let response: Response;
    try {
      response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          host,
          key,
          keyLocation,
          urlList: batch,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      throw new Error(`API batch ${index + 1}/${batches} request failed: ${errorMessage(error)}`);
    }

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(
        `API batch ${index + 1}/${batches} returned HTTP ${response.status} ${response.statusText}${await responseDetails(response)}`,
      );
    }

    validationPending ||= response.status === 202;
  }

  const status = validationPending ? "accepted; key validation is pending" : "accepted";
  console.log(`[IndexNow] ${urlList.length} unique sitemap URLs ${status} in ${batches} batch(es).`);
}

submitIndexNow().catch((error: unknown) => {
  console.error(`[IndexNow] Submission failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
