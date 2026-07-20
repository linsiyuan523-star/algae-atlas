import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/indexnow-key/[indexNowKey]/route";

test("serves only the configured IndexNow key with an exact response body", async () => {
  const previousKey = process.env.INDEXNOW_KEY;
  const configuredKey = "indexnow-test-key-12345678";

  try {
    process.env.INDEXNOW_KEY = configuredKey;

    const response = await GET(new Request(`https://sycszy.icu/${configuredKey}.txt`), {
      params: Promise.resolve({ indexNowKey: configuredKey }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(await response.text(), configuredKey);

    const wrongKeyResponse = await GET(new Request("https://sycszy.icu/different-indexnow-key.txt"), {
      params: Promise.resolve({ indexNowKey: "different-indexnow-key" }),
    });
    assert.equal(wrongKeyResponse.status, 404);

    process.env.INDEXNOW_KEY = "invalid key with spaces";
    const invalidConfigurationResponse = await GET(
      new Request("https://sycszy.icu/invalid-key.txt"),
      { params: Promise.resolve({ indexNowKey: "invalid-key" }) },
    );
    assert.equal(invalidConfigurationResponse.status, 404);
  } finally {
    if (previousKey === undefined) {
      delete process.env.INDEXNOW_KEY;
    } else {
      process.env.INDEXNOW_KEY = previousKey;
    }
  }
});
