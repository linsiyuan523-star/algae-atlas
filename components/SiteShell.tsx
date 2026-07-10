import Link from "next/link";
import type { ReactNode } from "react";
import {
  navigation,
  otherLocale,
  site,
  text,
  type Locale,
} from "@/lib/site-data";

type SiteShellProps = {
  locale: Locale;
  pathParts?: string[];
  children: ReactNode;
};

function Logo({ locale }: { locale: Locale }) {
  return (
    <Link className="brand" href={`/${locale}`} aria-label={text(site.name, locale)}>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-type">
        <strong>{text(site.name, locale)}</strong>
        <small>ALGAE · ECOLOGY · CULTURE</small>
      </span>
    </Link>
  );
}

function NavLinks({ locale, active }: { locale: Locale; active?: string }) {
  return (
    <>
      {navigation.map((item) => (
        <Link
          key={item.href}
          href={`/${locale}/${item.href}`}
          className={active === item.href ? "is-active" : undefined}
        >
          {text(item.label, locale)}
        </Link>
      ))}
    </>
  );
}

export function SiteShell({ locale, pathParts = [], children }: SiteShellProps) {
  const active = pathParts[0];
  const targetLocale = otherLocale(locale);
  const suffix = pathParts.length ? `/${pathParts.join("/")}` : "";

  return (
    <>
      <a className="skip-link" href="#main-content">
        {locale === "zh" ? "跳到主要内容" : "Skip to content"}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Logo locale={locale} />
          <nav className="desktop-nav" aria-label={locale === "zh" ? "主导航" : "Primary navigation"}>
            <NavLinks locale={locale} active={active} />
          </nav>
          <div className="header-actions">
            <Link className="language-switch" href={`/${targetLocale}${suffix}`} lang={targetLocale}>
              {targetLocale === "zh" ? "中文" : "EN"}
            </Link>
            <Link className="header-cta" href={`/${locale}/contact`}>
              {locale === "zh" ? "建立联系" : "Connect"}
              <span aria-hidden="true">↗</span>
            </Link>
            <details className="mobile-menu">
              <summary aria-label={locale === "zh" ? "打开菜单" : "Open menu"}>
                <span />
                <span />
              </summary>
              <nav aria-label={locale === "zh" ? "手机导航" : "Mobile navigation"}>
                <NavLinks locale={locale} active={active} />
                <Link href={`/${targetLocale}${suffix}`} lang={targetLocale}>
                  {targetLocale === "zh" ? "切换至中文" : "Switch to English"}
                </Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <Logo locale={locale} />
            <p>{text(site.description, locale)}</p>
          </div>
          <div className="footer-links">
            <p className="footer-label">{locale === "zh" ? "探索" : "Explore"}</p>
            <NavLinks locale={locale} active={active} />
          </div>
          <div className="footer-contact">
            <p className="footer-label">{locale === "zh" ? "预览说明" : "Preview note"}</p>
            <p>
              {locale === "zh"
                ? "当前为内容与视觉预览版，正式联系方式将在发布前补充。"
                : "This is a content and visual preview. Contact details will be added before launch."}
            </p>
            <Link href={`/${locale}/about#image-credits`}>
              {locale === "zh" ? "查看图片来源" : "Image credits"} →
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 {text(site.name, locale)}</span>
          <Link href={`/${locale}/privacy`}>{locale === "zh" ? "隐私说明" : "Privacy"}</Link>
          <span>{locale === "zh" ? "为公众理解藻类而设计" : "Designed for public understanding"}</span>
        </div>
      </footer>
    </>
  );
}
