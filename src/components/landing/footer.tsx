import { Mail, MapPin, Phone } from "lucide-react";

import { siteConfig } from "@/config/site";
import { footerLinks } from "@/content/landing";
import { Container } from "./section";

/**
 * VALIDAR: a logo oficial da Mundo Digital Tech ainda não foi enviada. Até lá
 * o nome aparece em texto; troque pelo arquivo oficial sem recriá-lo.
 */
function MundoDigitalTechMark() {
  return (
    <span className="font-display text-xl leading-tight font-bold tracking-wide">
      MUNDO
      <br />
      <span className="text-pink-300">DIGITAL TECH</span>
    </span>
  );
}

export function Footer() {
  const { contact } = siteConfig;
  return (
    <footer id="rodape" className="bg-navy text-white">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.5fr]">
        <div>
          <MundoDigitalTechMark />
          <p className="mt-3 max-w-xs text-sm text-white/70">
            O MDSign é uma solução da {siteConfig.company}.
          </p>
        </div>

        {Object.entries(footerLinks).map(([group, links]) => (
          <nav key={group} aria-label={group}>
            <p className="font-semibold">{group}</p>
            <ul className="mt-3 space-y-2 text-sm text-white/75">
              {links.map((link) => (
                <li key={link.label}>
                  {link.href ? (
                    <a href={link.href} className="hover:text-white">
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
        <Container className="py-5 text-xs text-white/60">
          © {new Date().getFullYear()} MDSign · {siteConfig.company}. Todos os direitos reservados.
        </Container>
      </div>
    </footer>
  );
}
