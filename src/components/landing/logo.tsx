import icon from "@/assets/brand/mdsign-icon.png";
import wordmark from "@/assets/brand/mdsign-wordmark.png";
import tagline from "@/assets/brand/mdsign-tagline.png";
import { cn } from "@/lib/utils";

/**
 * Logo oficial MDSign (extraída do PDF "MDSign - Logo Sem Registro").
 * Disposição horizontal com as peças originais — sem redesenho. O slogan da
 * logo é parte do arquivo oficial (em português) e fica decorativo para leitores
 * de tela; o slogan traduzido aparece no conteúdo da página.
 */
export function Logo({
  className,
  showTagline = true,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img src={icon} alt="" width={102} height={112} className="h-10 w-auto" />
      <span className="flex flex-col items-start gap-1">
        <img src={wordmark} alt="MDSign" width={192} height={56} className="h-6 w-auto" />
        {showTagline && (
          <img
            src={tagline}
            alt=""
            aria-hidden
            width={354}
            height={20}
            className="hidden h-[7px] w-auto sm:block"
          />
        )}
      </span>
    </span>
  );
}

export { icon as logoIcon };
