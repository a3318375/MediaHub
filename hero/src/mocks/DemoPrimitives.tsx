import { ArrowDown, ArrowUp } from "lucide-react";

export function Avatar({
  name = "Kate Moore",
  avatar = "blue-light",
  className = "",
}: {
  name?: string;
  avatar?: string;
  className?: string;
}) {
  return (
    <img
      src={`/avatars/${avatar}.jpg`}
      alt={name}
      className={`avatar ${className}`}
    />
  );
}

export function Growth({
  value = "3.3%",
  negative = false,
  soft = false,
}: {
  value?: string;
  negative?: boolean;
  soft?: boolean;
}) {
  return (
    <span
      className={`growth ${negative ? "negative" : ""} ${soft ? "soft" : ""}`}
    >
      {negative ? <ArrowDown size={11} /> : <ArrowUp size={11} />} {value}
    </span>
  );
}
