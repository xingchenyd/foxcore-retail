import type { CSSProperties } from 'react';

export type IconName = 'overview' | 'events' | 'products' | 'people' | 'stock' | 'sales' | 'returns' | 'commissions' | 'reports' | 'audit' | 'arrow' | 'search' | 'refresh' | 'logout' | 'check' | 'alert' | 'clock' | 'close' | 'plus';

const paths: Record<IconName, string[]> = {
  overview: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  events: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3'],
  products: ['m12 3 9 5v9l-9 5-9-5V8l9-5Z', 'm3 8 9 5 9-5M12 13v9M7.5 5.5l9 5'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM16 3.13a4 4 0 0 1 0 7.75'],
  stock: ['m3 9 9-6 9 6v12H3V9Z', 'M7 21v-8h10v8M7 17h10M12 13v8'],
  sales: ['M3 3h2l2.5 12h10.8l2-9H6M9 20h.01M17 20h.01', 'M8 19a1 1 0 1 0 2 0 1 1 0 0 0-2 0ZM16 19a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z'],
  returns: ['M3 10h11a6 6 0 0 1 0 12', 'm7 6-4 4 4 4M14 4h7v9'],
  commissions: ['M3 7h18v14H3zM3 7V4h15v3M16 12h5v5h-5zM16 14.5h.01'],
  reports: ['M4 3v18h17M8 16v-4M13 16V7M18 16V4'],
  audit: ['M6 3h9l4 4v14H6V3Z', 'M14 3v5h5M9 12h7M9 16h7'],
  arrow: ['M5 12h14m-5-5 5 5-5 5'],
  search: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l5 5'],
  refresh: ['M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13.2 2M4.7 15.9a8 8 0 0 0 13.2 2'],
  logout: ['M9 4H4v16h5M10 12h11m-4-4 4 4-4 4'],
  check: ['m5 12 4 4L19 6'],
  alert: ['m12 3 10 18H2L12 3ZM12 9v5M12 17h.01'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2'],
  close: ['m6 6 12 12M18 6 6 18'],
  plus: ['M12 5v14M5 12h14'],
};

export function Icon({ name, size = 18, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name].map((path, i) => <path key={i} d={path}/>)}</svg>;
}
