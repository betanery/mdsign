import icon from "@/assets/brand/mdsign-icon.png";
import wordmark from "@/assets/brand/mdsign-wordmark.png";
import tagline from "@/assets/brand/mdsign-tagline.png";
import { cn } from "@/lib/utils";

/**
 * Logo oficial MDSign (extraída do PDF "MDSign - Logo Sem Registro").
 * Disposição horizontal com as peças originais — sem redesenho.
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
      <img src={icon} alt="" width={256} height={281} className="h-10 w-auto" />
      <span className="flex flex-col gap-1">
        <img src={wordmark} alt="MDSign" width={411} height={120} className="h-6 w-auto" />
        {showTagline && (
          <img
            src={tagline}
            alt="Não use papel, plante uma árvore!"
            width={709}
            height={40}
            className="hidden h-[7px] w-auto sm:block"
          />
        )}
      </span>
    </span>
  );
}

export { icon as logoIcon };
