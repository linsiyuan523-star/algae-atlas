import Link from "next/link";
import { ContentReviewPanel } from "@/components/ContentReviewPanel";
import { Arrow, localPath, PageHero, SectionHeading } from "@/components/PagePrimitives";
import {
  collaborationApprovalNotice,
  collaborationAreas,
  collaborationBoundaries,
  collaborationPageReview,
  collaborationPreparationItems,
  collaborationPreparationNotice,
  collaborationProcess,
  type CollaborationArea,
  type CollaborationStatus,
} from "@/lib/collaboration-data";
import { text, type Locale, type LocalizedText } from "@/lib/site-data";

function LocalizedList({ items, locale }: { items: LocalizedText[]; locale: Locale }) {
  return (
    <ul>
      {items.map((item, index) => <li key={`${index}-${item.en}`}>{text(item, locale)}</li>)}
    </ul>
  );
}

function statusLabel(status: CollaborationStatus, locale: Locale) {
  const labels: Record<CollaborationStatus, LocalizedText> = {
    "open-for-discussion": { zh: "可进一步沟通", en: "Open for discussion" },
    "case-by-case": { zh: "需按具体条件评估", en: "Case-by-case assessment" },
    "internal-only": { zh: "仅限内部讨论", en: "Internal discussion only" },
  };

  return text(labels[status], locale);
}

function routeLabel(route: string, locale: Locale) {
  const labels: Record<string, LocalizedText> = {
    "research/microalgae": { zh: "微藻研究", en: "Microalgae Research" },
    "research/macroalgae": { zh: "大型海藻研究", en: "Macroalgae Research" },
    "research/algal-blooms": { zh: "近岸藻华与赤潮专题", en: "Coastal Algal Blooms and Red Tide" },
    "live-feeds": { zh: "生物饵料与浮游动物", en: "Live Feeds and Zooplankton" },
    tutorials: { zh: "实验仪器教程", en: "Laboratory Tutorials" },
    algae: { zh: "藻类图鉴", en: "Algae Atlas" },
  };

  return labels[route] ? text(labels[route], locale) : route;
}

function InformationBlock({ title, items, locale }: { title: string; items: LocalizedText[]; locale: Locale }) {
  return (
    <section className="collaboration-info-block">
      <h4>{title}</h4>
      <LocalizedList items={items} locale={locale} />
    </section>
  );
}

function CollaborationAreaCard({ area, locale, index }: { area: CollaborationArea; locale: Locale; index: number }) {
  return (
    <details className="collaboration-area-card" id={area.id}>
      <summary className="collaboration-card-summary">
        <span className="collaboration-card-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="collaboration-status" data-status={area.status}>{statusLabel(area.status, locale)}</span>
        <span className="collaboration-card-title" role="heading" aria-level={3}>{text(area.title, locale)}</span>
        <span className="collaboration-card-description">{text(area.summary, locale)}</span>
        <span className="collaboration-card-toggle" aria-hidden="true">＋</span>
      </summary>

      <div className="collaboration-card-content">
        <div className="collaboration-card-grid">
          <InformationBlock
            title={locale === "zh" ? "适合的合作对象" : "Who This May Suit"}
            items={area.suitableFor}
            locale={locale}
          />
          <InformationBlock
            title={locale === "zh" ? "可讨论的问题" : "Questions for Discussion"}
            items={area.possibleTopics}
            locale={locale}
          />
          <InformationBlock
            title={locale === "zh" ? "合作方需要准备的信息" : "Information the Partner Should Prepare"}
            items={area.partnerShouldProvide}
            locale={locale}
          />
          <InformationBlock
            title={locale === "zh" ? "团队可能参与的工作" : "Work the Team May Contribute To"}
            items={area.teamMayContribute}
            locale={locale}
          />
        </div>

        <div className="collaboration-page-notice" role="note">
          <strong>{locale === "zh" ? "条件与边界" : "Conditions and boundaries"}</strong>
          <p>{text(area.caveat, locale)}</p>
        </div>

        <div className="collaboration-card-footer">
          <div className="collaboration-related-links">
            <h4>{locale === "zh" ? "相关研究与学习页面" : "Related Research and Learning Pages"}</h4>
            <div>
              {area.relatedRoutes.map((route) => (
                <Link key={route} href={localPath(locale, route)}>
                  {routeLabel(route, locale)} <Arrow />
                </Link>
              ))}
            </div>
          </div>
          <div className="collaboration-review">
            <ContentReviewPanel review={area.review} locale={locale} />
          </div>
          <Link className="button dark" href="#prepare">
            {locale === "zh" ? "准备合作信息" : "Prepare an Enquiry"} <Arrow />
          </Link>
        </div>
      </div>
    </details>
  );
}

export function CollaborationPage({ locale }: { locale: Locale }) {
  return (
    <div className="collaboration-page">
      <PageHero
        locale={locale}
        eyebrow={locale === "zh" ? "合作与交流" : "COLLABORATION"}
        title={locale === "zh" ? "让研究问题转化为可评估的合作方向" : "Turning Research Questions into Assessable Collaborations"}
        intro={locale === "zh"
          ? "团队围绕微藻、大型海藻、生物饵料、近岸藻华与水产养殖应用开展研究。高校、科研机构、养殖单位及相关合作伙伴可根据具体研究对象、样品条件和目标，与团队进一步沟通潜在合作。"
          : "The team studies microalgae, macroalgae, live feeds, coastal algal blooms, and aquaculture applications. Universities, research institutes, aquaculture organizations, and other partners may discuss potential collaboration based on defined organisms, samples, objectives, and available resources."}
      >
        <div className="button-row collaboration-hero-actions">
          <Link className="button primary" href="#areas">
            {locale === "zh" ? "查看合作方向" : "Explore Collaboration Areas"} <Arrow />
          </Link>
          <Link className="button ghost" href="#prepare">
            {locale === "zh" ? "准备合作信息" : "Prepare an Enquiry"} <Arrow />
          </Link>
          <Link className="button ghost" href={localPath(locale, "contact")}>
            {locale === "zh" ? "联系团队" : "Contact the Team"} <Arrow />
          </Link>
        </div>
      </PageHero>

      <section className="section-shell content-section collaboration-areas-section" id="areas">
        <div className="collaboration-page-notice" role="note">
          <div>
            <strong>{locale === "zh" ? "页面定位" : "Page scope"}</strong>
            <p>
              {locale === "zh"
                ? "本页说明团队潜在科研、教学、采样与技术交流方向，不是商业服务页面，也不构成合作或能力承诺。是否开展取决于研究目标、时间、资源和合规要求。"
                : "This page outlines potential research, teaching, sampling, and technical exchange. It is not a commercial service page or a commitment of collaboration or capacity. Whether work proceeds depends on the objective, timing, resources, and compliance requirements."}
            </p>
          </div>
          <div className="collaboration-review is-compact">
            <ContentReviewPanel review={collaborationPageReview} locale={locale} compact />
          </div>
        </div>

        <SectionHeading
          eyebrow={`01 / ${locale === "zh" ? "潜在合作方向" : "POTENTIAL COLLABORATION AREAS"}`}
          title={locale === "zh" ? "六类可以进一步讨论的研究与交流方向" : "Six research and exchange areas for further discussion"}
          intro={locale === "zh"
            ? "展开每张卡片可查看适合对象、准备信息、可能参与内容与合作边界。"
            : "Open each card to review suitable partners, preparation needs, possible contributions, and collaboration boundaries."}
        />
        <div className="collaboration-area-grid">
          {collaborationAreas.map((area, index) => (
            <CollaborationAreaCard key={area.id} area={area} locale={locale} index={index} />
          ))}
        </div>
      </section>

      <section className="dark-section collaboration-prepare-section" id="prepare">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`02 / ${locale === "zh" ? "沟通准备" : "ENQUIRY PREPARATION"}`}
            title={locale === "zh" ? "为了让第一次沟通更有效，请先准备这些信息" : "Information to Prepare Before an Initial Discussion"}
            intro={locale === "zh"
              ? "先整理非敏感摘要，有助于双方判断问题范围和所需条件。"
              : "A non-sensitive summary helps both sides understand the scope and conditions needed for an initial assessment."}
          />
          <ol className="collaboration-preparation-grid">
            {collaborationPreparationItems.map((item, index) => (
              <li key={item.en}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{text(item, locale)}</p>
              </li>
            ))}
          </ol>
          <div className="collaboration-page-notice is-dark" role="note">
            <strong>{locale === "zh" ? "隐私与敏感资料" : "Privacy and sensitive information"}</strong>
            <p>{text(collaborationPreparationNotice, locale)}</p>
          </div>
        </div>
      </section>

      <section className="section-shell content-section collaboration-process-section">
        <SectionHeading
          eyebrow={`03 / ${locale === "zh" ? "合作流程" : "COLLABORATION PROCESS"}`}
          title={locale === "zh" ? "从研究问题到可追溯记录的五步流程" : "Five steps from a research question to traceable records"}
          intro={locale === "zh"
            ? "流程用于帮助双方在正式开展前明确条件、责任和审批要求。"
            : "The process helps both sides clarify conditions, responsibilities, and approvals before work begins."}
        />
        <ol className="collaboration-process-list">
          {collaborationProcess.map((step, index) => (
            <li className="collaboration-process-step" key={step.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{text(step.title, locale)}</h3>
                <p>{text(step.summary, locale)}</p>
                {step.details ? <LocalizedList items={step.details} locale={locale} /> : null}
              </div>
            </li>
          ))}
        </ol>
        <div className="collaboration-page-notice" role="note">
          <strong>{locale === "zh" ? "审批说明" : "Approval notice"}</strong>
          <p>{text(collaborationApprovalNotice, locale)}</p>
        </div>
      </section>

      <section className="collaboration-boundaries-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`04 / ${locale === "zh" ? "科研规范" : "RESEARCH PRACTICE"}`}
            title={locale === "zh" ? "合作边界与科研规范" : "Collaboration Boundaries and Research Practice"}
            intro={locale === "zh"
              ? "在交换样品、数据或开展工作前，应先明确真实性、生物安全、责任和公开范围。"
              : "Before exchanging samples or data or beginning work, clarify integrity, biosafety, responsibilities, and disclosure boundaries."}
          />
          <div className="collaboration-boundary-grid">
            {collaborationBoundaries.map((boundary, index) => (
              <article key={boundary.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{text(boundary.title, locale)}</h3>
                <p>{text(boundary.summary, locale)}</p>
                {boundary.details ? <LocalizedList items={boundary.details} locale={locale} /> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell content-section collaboration-cases-status">
        <div className="compact-publication-status">
          <article>
            <strong>{locale === "zh" ? "合作案例" : "Collaboration Cases"}</strong>
            <span>{locale === "zh" ? "暂不公开未经双方确认的合作单位和项目。" : "Partner organizations and projects are not published without confirmation from both parties."}</span>
          </article>
        </div>
      </section>

      <section className="cta-panel section-shell collaboration-contact-cta">
        <div>
          <p className="eyebrow">05 / CONTACT</p>
          <h2>{locale === "zh" ? "从一份清晰的研究问题开始" : "Start with a clear research question"}</h2>
        </div>
        <p>
          {locale === "zh"
            ? "请先按清单整理不含敏感信息的摘要，再通过联系页面查看公开联系信息的确认状态。具体合作仍需负责人、相关单位和学校确认。"
            : "Prepare a non-sensitive summary using the checklist, then use the contact page to check the confirmation status of public contact information. Any specific collaboration still requires confirmation by the team lead, relevant organizations, and the university."}
        </p>
        <div className="cta-actions">
          <Link className="button dark" href="#prepare">
            {locale === "zh" ? "查看准备清单" : "View the Checklist"}
          </Link>
          <Link className="button dark" href={localPath(locale, "contact")}>
            {locale === "zh" ? "联系团队" : "Contact the Team"} <Arrow />
          </Link>
        </div>
      </section>
    </div>
  );
}
