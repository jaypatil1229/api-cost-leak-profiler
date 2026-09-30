import Link from "next/link";
import { BrandMark } from "@/components/shared/brand-mark";
import { Container } from "@/components/shared/section";
import { FOOTER_NAV, SAMPLE_DATA_NOTICE } from "@/lib/constants";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div className="flex max-w-xs flex-col gap-4">
            <BrandMark />
            <p className="text-sm leading-relaxed text-muted-foreground">
              An observability layer that connects LLM API spend to the features, users, and requests behind it.
            </p>
          </div>
          {FOOTER_NAV.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">{group.title}</h2>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.href}`}>
                    <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 ACLP. Prototype build.</p>
          <p className="max-w-xl sm:text-right">{SAMPLE_DATA_NOTICE}</p>
        </div>
      </Container>
    </footer>
  );
}
