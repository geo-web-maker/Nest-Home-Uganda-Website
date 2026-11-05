import { expect, test } from '@playwright/test';
import { mockAdminApi, signInReferenceAdmin, navigateToAdminPath } from './admin-fixtures';

test('admin reads formatted mail and composes a table-backed message through the shared editor', async ({ page }) => {
  await mockAdminApi(page, { scopes: ['mail:use'] });
  const outbound: Array<{ path: string; method: string; body?: unknown }> = [];
  await page.route('**/api/v1/mail/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let result: unknown = { status: 'ok' };
    if (method !== 'GET') outbound.push({ path, method, body: request.postData() ? request.postDataJSON() : undefined });
    if (path === '/api/v1/mail/mailboxes' && method === 'GET') {
      result = { items: [{ id: 'box-1', address: 'care@nest.test', display_name: 'Care team', unread_count: 1 }] };
    } else if (path === '/api/v1/mail/mailboxes/box-1/messages' && method === 'GET') {
      result = { items: [{ mailbox_message_id: 'item-1', message_id: 'message-1', folder: 'inbox', from_address: 'client@example.test', from_name: 'Client', subject: 'Quarterly care plan', snippet: 'Please review the plan', origin: 'inbound', received_at: '2026-11-04T09:00:00Z', is_read: false, is_starred: false }] };
    } else if (path === '/api/v1/mail/messages/item-1' && method === 'GET') {
      result = { mailbox_message_id: 'item-1', message_id: 'message-1', folder: 'inbox', from_address: 'client@example.test', from_name: 'Client', subject: 'Quarterly care plan', body_text: 'Please review the care plan.', body_html: '<h2>Care plan</h2><p><strong>Review</strong> the updated schedule.</p><table><tbody><tr><td>Morning</td><td>08:00</td></tr></tbody></table>', body_format: 'html', origin: 'inbound', is_read: true, is_starred: false, recipients: [{ kind: 'to', address: 'care@nest.test' }], attachments: [], render_notes: {}, has_remote_images: false };
    } else if (path === '/api/v1/mail/drafts' && method === 'POST') {
      result = { id: 'draft-1', status: 'draft', attachments: [] };
    } else if (path === '/api/v1/mail/drafts/draft-1' && method === 'PUT') {
      result = { id: 'draft-1', status: 'draft' };
    } else if (path === '/api/v1/mail/drafts/draft-1/send' && method === 'POST') {
      result = { status: 'queued' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });

  await signInReferenceAdmin(page);
  await navigateToAdminPath(page, '/admin/mail');
  await expect(page.getByText('Quarterly care plan', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Quarterly care plan/ }).click();
  await expect(page.getByRole('heading', { name: 'Care plan' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  await page.getByRole('button', { name: 'Compose' }).click();
  const dialog = page.getByRole('dialog', { name: /Compose/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('To').fill('recipient@example.test');
  await dialog.getByLabel('Subject').fill('Care plan update');
  const editor = dialog.locator('[contenteditable="true"][role="textbox"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.fill('Updated details');
  await dialog.getByRole('button', { name: 'Insert table' }).click();
  const tableDialog = dialog.getByRole('dialog', { name: 'Insert table' });
  await tableDialog.getByRole('button', { name: 'Insert table' }).click();
  await expect(editor.locator('table')).toBeVisible();
  await dialog.getByRole('button', { name: 'Send' }).click();
  const confirm = dialog.getByRole('alertdialog', { name: /Review before sending/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Confirm send' }).click();
  await expect.poll(() => outbound.some((item) => item.path === '/api/v1/mail/drafts/draft-1/send')).toBeTruthy();
  const savedDraft = outbound.find((item) => item.path === '/api/v1/mail/drafts' && item.method === 'POST');
  expect(savedDraft?.body).toMatchObject({ to: ['recipient@example.test'], format: 'html' });
});
