import type { CSSProperties, ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, style, className, onClick }: CardProps) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
