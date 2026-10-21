import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'outline' | 'whatsapp';
export type ButtonSize = 'default' | 'header';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

type AnchorProps = CommonProps & {
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>;

type ActionProps = CommonProps & {
  href?: undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export type ButtonProps = AnchorProps | ActionProps;

function isInternal(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

/**
 * Pill button. Renders a router Link for internal paths, an anchor for other
 * links (tel, wa.me), and a button element when there is no href.
 */
export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'default', fullWidth = false, className, children } = props;
  const classes = cx(
    styles.button,
    styles[variant],
    size === 'header' && styles.header,
    fullWidth && styles.full,
    className,
  );

  if (props.href !== undefined) {
    const {
      href,
      variant: _v,
      size: _s,
      fullWidth: _f,
      className: _c,
      children: _ch,
      ...rest
    } = props;
    if (isInternal(href)) {
      return (
        <Link to={href} className={classes} data-variant={variant} {...rest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={classes} data-variant={variant} {...rest}>
        {children}
      </a>
    );
  }

  const {
    variant: _v,
    size: _s,
    fullWidth: _f,
    className: _c,
    children: _ch,
    type = 'button',
    ...rest
  } = props;
  return (
    <button type={type} className={classes} data-variant={variant} {...rest}>
      {children}
    </button>
  );
}
