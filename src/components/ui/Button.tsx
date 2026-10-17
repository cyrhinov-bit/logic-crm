import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'block';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button className={`ui-btn ui-btn-${variant} ui-btn-${size}${className ? ` ${className}` : ''}`} {...rest}>
      {icon && <span className="ui-btn-icon">{icon}</span>}
      {children}
    </button>
  );
}
