import Link from "next/link";
import type { ReactNode } from "react";
import { navigation, otherLocale, site, text, type Locale } from "@/lib/site-data";

type SiteShellProps = {
  locale: Locale;
  pathParts?: string[];
  children: ReactNode;
};

function pathFor(locale: Locale, href: string) {
  return href ? `/${locale}/${href}` : `/${locale}`;
}

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
        <small>{text(site.institution, locale)}</small>
      </span>
    </Link>
  );
}

function NavLinks({ locale, active }: { locale: Locale; active: string }) {
  return (
    <>
      {navigation.map((item) => (
        <Link
          key={item.href || "home"}
          href={pathFor(locale, item.href)}
          className={active === item.href ? "is-active" : undefined}
          aria-current={active === item.href ? "page" : undefined}
        >
          {text(item.label, locale)}
        </Link>
      ))}
    </>
  );
}

export function SiteShell({ locale, pathParts = [], children }: SiteShellProps) {
  const active = pathParts[0] ?? "";
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
            <p className="footer-label">{locale === "zh" ? "访问" : "Explore"}</p>
            <Link href={`/${locale}/team`}>{locale === "zh" ? "团队概况" : "Team"}</Link>
            <Link href={`/${locale}/research`}>{locale === "zh" ? "研究方向" : "Research"}</Link>
            <Link href={`/${locale}/live-feeds`}>{locale === "zh" ? "生物饵料" : "Live Feeds"}</Link>
            <Link href={`/${locale}/tutorials`}>{locale === "zh" ? "仪器教程" : "Tutorials"}</Link>
            <Link href={`/${locale}/algae`}>{locale === "zh" ? "藻类图鉴" : "Algae Atlas"}</Link>
          </div>
          <div className="footer-contact">
            <p className="footer-label">{locale === "zh" ? "网站信息" : "Site information"}</p>
            <p>
              {locale === "zh"
                ? "团队资料、研究成果与实验教程正在持续整理和内部核实。"
                : "Team profiles, research outputs, and laboratory tutorials are being prepared and internally verified."}
            </p>
            <div className="footer-inline-links">
              <Link href={`/${locale}/about#image-credits`}>{locale === "zh" ? "图片来源" : "Credits"}</Link>
              <Link href={`/${locale}/contact`}>{locale === "zh" ? "联系" : "Contact"}</Link>
              <Link href={`/${locale}/privacy`}>{locale === "zh" ? "隐私" : "Privacy"}</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 {locale === "zh" ? "广东海洋大学藻类团队" : "Algae Research Team, Guangdong Ocean University"}</span>
          <span>{text(site.featureName, locale)}</span>
        </div>
      </footer>
    </>
  );
}
