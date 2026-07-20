import { parseIndexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ indexNowKey: string }>;
};

function notFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const configuredKey = parseIndexNowKey(process.env.INDEXNOW_KEY);
  const { indexNowKey } = await params;

  if (!configuredKey || indexNowKey !== configuredKey) {
    return notFoundResponse();
  }

  return new Response(configuredKey, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  });
}
