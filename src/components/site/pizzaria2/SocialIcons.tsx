export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.5 21v-7.6h2.55l.38-2.96h-2.93V8.56c0-.86.24-1.44 1.47-1.44h1.57V4.48A21 21 0 0 0 14.36 4c-2.31 0-3.89 1.41-3.89 4V10.4H7.9v2.96h2.57V21z" />
    </svg>
  );
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.6 3h-3.1v12.2c0 1.36-1.1 2.47-2.47 2.47a2.47 2.47 0 0 1 0-4.94c.23 0 .45.03.66.09v-3.16a5.6 5.6 0 0 0-.66-.04A5.63 5.63 0 1 0 16.7 15.1a5.6 5.6 0 0 0-.1-1.03V9.3a7.9 7.9 0 0 0 4.4 1.34V7.55a4.6 4.6 0 0 1-4.4-4.55z" />
    </svg>
  );
}
