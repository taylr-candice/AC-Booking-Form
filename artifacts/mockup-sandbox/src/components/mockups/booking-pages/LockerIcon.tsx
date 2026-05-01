import type { SVGProps } from "react";

export function LockerIcon({ className, style, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      {...rest}
    >
      {/* Outer shell */}
      <rect x="2" y="3" width="20" height="18" rx="1.5" />
      {/* Vertical dividers between the 3 doors */}
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
      {/* Ventilation slots — left door */}
      <line x1="3.5" y1="6.5" x2="7.5" y2="6.5" />
      <line x1="3.5" y1="8.5" x2="7.5" y2="8.5" />
      {/* Ventilation slots — middle door */}
      <line x1="10.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="10.5" y1="8.5" x2="13.5" y2="8.5" />
      {/* Ventilation slots — right door */}
      <line x1="16.5" y1="6.5" x2="20.5" y2="6.5" />
      <line x1="16.5" y1="8.5" x2="20.5" y2="8.5" />
      {/* Door handle — left */}
      <rect x="4.75" y="13" width="1.5" height="3" rx="0.75" />
      {/* Door handle — middle */}
      <rect x="11.25" y="13" width="1.5" height="3" rx="0.75" />
      {/* Door handle — right */}
      <rect x="17.75" y="13" width="1.5" height="3" rx="0.75" />
    </svg>
  );
}
