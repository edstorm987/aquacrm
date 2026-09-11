import Image from "next/image";

/**
 * Google's unmodified, non-outlined logo for plain light backgrounds.
 * The wrapper preserves the required clear space around the native 98 x 18px
 * asset. Keep provider-specific attribution alongside this component.
 */
export function GoogleMapsAttribution({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 px-2.5 pb-1.5 pt-2.5 ${className}`}>
      <Image
        src="/attribution/google-maps-dark-gray.png"
        width={98}
        height={18}
        alt="Google Maps"
        unoptimized
      />
    </span>
  );
}
