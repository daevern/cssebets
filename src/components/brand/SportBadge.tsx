import f1Logo from "@/assets/f1-logo.png";
import ufcLogo from "@/assets/ufc-logo.png";

export function F1Badge({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={f1Logo}
      alt="F1"
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ height: size, width: "auto" }}
    />
  );
}

export function UfcBadge({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={ufcLogo}
      alt="UFC"
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ height: size, width: "auto" }}
    />
  );
}
