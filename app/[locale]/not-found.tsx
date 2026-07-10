import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <p className="eyebrow">404 / NOT FOUND</p>
      <h1>这片水域还没有内容</h1>
      <p>The page you are looking for has not been mapped yet.</p>
      <Link className="button primary" href="/zh">返回首页 / Home</Link>
    </main>
  );
}
