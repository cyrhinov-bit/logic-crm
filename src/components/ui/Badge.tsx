import type { ReactNode } from 'react';
import './Badge.css';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`ui-badge ui-badge-${variant}`}>{children}</span>;
}
