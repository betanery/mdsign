import { Mail, MapPin, Phone } from "lucide-react";

import { siteConfig } from "@/config/site";
import { footerCompanyLinks, footerProductLinks } from "@/content/landing";
import { useI18n } from "@/i18n";
import mundoDigitalTechLogo from "@/assets/brand/mundo-digital-tech-branca.svg";
import { openCookiePreferences } from "@/lib/consent";
import { Container } from "./section";

export function Footer() {
  const { contact } = siteConfig;
  const { t, path } = useI18n();
  const groups = [
    {
      title: t.footer.productTitle,
      links: t.footer.product.map((label, i) => ({ label, href: footerProductLinks[i] })),
    },
    {
      title: t.footer.companyTitle,
      links: t.footer.company.map((label, i) => ({ label, href: footerCompanyLinks[i] })),
    },
  ];

  return (
    <footer id="rodape" className="bg-navy text-white">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.5fr]">
        <div>
          {/* Versão branca da logo oficial, para o fundo azul do rodapé. */}
          <img
            src={mundoDigitalTechLogo}
            alt={siteConfig.company}
            width={184}
            height={90}
            loading="lazy"
            className="h-16 w-auto"
          />
          <p className="mt-3 max-w-xs text-sm text-white/70">{t.footer.solutionBy}</p>
        </div>

        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <p className="font-semibold">{group.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-white/75">
              {group.links.map((link) => (
                <li key={link.label}>
                  {link.href ? (
                    <a href={path(link.href)} className="hover:text-white">
                      {link.label}
                    </a>
                  ) : (
                    <span>{link.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <address className="space-y-3 text-sm text-white/80 not-italic">
          <a href={contact.phoneHref} className="flex items-center gap-3 hover:text-white">
            <Phone className="size-4 shrink-0" aria-hidden />
            {contact.phoneDisplay}
          </a>
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-3 break-all hover:text-white"
          >
            <Mail className="size-4 shrink-0" aria-hidden />
            {contact.email}
          </a>
          <p className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {contact.address}
          </p>
        </address>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-white/60">
          <span>
            © {new Date().getFullYear()} MDSign · {siteConfig.company}. {t.footer.rights}
          </span>
          <nav
            aria-label={`${t.footer.terms} · ${t.footer.privacy}`}
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            <a href={path("/termos")} className="hover:text-white">
              {t.footer.terms}
            </a>
            <a href={path("/privacidade")} className="hover:text-white">
              {t.footer.privacy}
            </a>
            <a href={path("/validar")} className="hover:text-white">
              {t.footer.validate}
            </a>
            <a href={path("/titular")} className="hover:text-white">
              {t.footer.dataRights}
            </a>
            <button type="button" onClick={openCookiePreferences} className="hover:text-white">
              {t.footer.cookies}
            </button>
          </nav>
        </Container>
      </div>
    </footer>
  );
}
