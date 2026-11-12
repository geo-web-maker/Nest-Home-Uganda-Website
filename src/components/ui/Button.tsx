import { createContext, useContext } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'outline' | 'whatsapp' | 'forest';
/**
 * default: marketing pill. header: site header. control: matches a form control (48px).
 * compact: inline actions inside table rows and cards.
 */
export type ButtonSize = 'default' | 'header' | 'control' | 'compact';

const ButtonSizeContext = createContext<ButtonSize>('default');

/**
 * Sets the size every Button below it uses unless the Button passes its own `size`.
 * The admin shell wraps its pages in `control`; table cells and ButtonGroup switch to `compact`.
 */
export const ButtonSizeProvider = ButtonSizeContext.Provider;

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  arrow?: boolean;
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
  const inherited = useContext(ButtonSizeContext);
  const { variant = 'primary', size = inherited, fullWidth = false, arrow = false, className, children } = props;
  const classes = cx(
    styles.button,
    styles[variant],
    arrow && styles.withArrow,
    size === 'header' && styles.header,
    size === 'control' && styles.control,
    size === 'compact' && styles.compact,
    fullWidth && styles.full,
    className,
  );

  if (props.href !== undefined) {
    const {
      href,
      variant: _v,
      size: _s,
      fullWidth: _f,
      arrow: _a,
      className: _c,
      children: _ch,
      ...rest
    } = props;
    if (isInternal(href)) {
      return (
        <Link to={href} className={classes} data-variant={variant} data-size={size} {...rest}>
          {children}
          {arrow && <span className={styles.arrow} aria-hidden="true">→</span>}
        </Link>
      );
    }
    return (
      <a href={href} className={classes} data-variant={variant} data-size={size} {...rest}>
        {children}
        {arrow && <span className={styles.arrow} aria-hidden="true">→</span>}
      </a>
    );
  }

  const {
    variant: _v,
    size: _s,
    fullWidth: _f,
    arrow: _a,
    className: _c,
    children: _ch,
    type = 'button',
    ...rest
  } = props;
  return (
    <button type={type} className={classes} data-variant={variant} data-size={size} {...rest}>
      {children}
      {arrow && <span className={styles.arrow} aria-hidden="true">→</span>}
    </button>
  );
}
