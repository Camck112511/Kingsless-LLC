/** Small stroke icons for the public site. Decorative: they carry no meaning that the text next to them does not. */
const paths: Record<string, React.ReactNode> = {
  scope: (
    <>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M8 6H6.5A1.5 1.5 0 0 0 5 7.5v12A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 17.5 6H16" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2.2 2.2L15 10.4" />
    </>
  ),
  handshake: (
    <>
      <path d="M3 11l4-4 4 1 3-2 4 3 3-1" />
      <path d="M3 11v4l5 4 3-1 2 1 4-3 3-3v-2" />
      <path d="m9 14 2 2M12 12l3 3" />
    </>
  ),
  project: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M8 4v5M8 13h3M8 16.5h6" />
    </>
  ),
  document: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.7L16 9.5" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
};

export function Icon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name] ?? paths.check}
    </svg>
  );
}
