import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogoutGuard } from './LogoutGuard';

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('LogoutGuard', () => {
  it('does not render while closed', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(LogoutGuard, { open: false, pendingItems: 2, onCancel: vi.fn(), onConfirm: vi.fn() })));
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('explains saved work and offers both explicit choices', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(LogoutGuard, { open: true, pendingItems: 2, onCancel: vi.fn(), onConfirm: vi.fn() })));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('2 saved items');
    expect(container.textContent).toContain('Keep working');
    expect(container.textContent).toContain('Sign out and keep saved work');
  });

  it('calls the confirmation callback only when explicitly selected', () => {
    const onConfirm = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(LogoutGuard, { open: true, pendingItems: 1, onCancel: vi.fn(), onConfirm })));
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'Sign out and keep saved work');
    expect(button).toBeTruthy();
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
