import { expect, test } from '@playwright/test';
import { installMockApi, loginAsDemoNurse } from './fixtures';

function installMailRoutes(page: Parameters<typeof installMockApi>[0]) {
  const sent: Array<{ path: string; method: string; body?: unknown }> = [];
  return page.route('**/api/v1/mail/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== 'GET') sent.push({ path, method, body: request.postData() ? request.postDataJSON() : undefined });
    let result: unknown = { status: 'ok' };
    if (path === '/api/v1/mail/mailboxes' && method === 'GET') {
      result = { items: [{ id: 'box-1', address: 'amina@nest.test', display_name: 'Amina', unread_count: 1 }] };
    } else if (path === '/api/v1/mail/mailboxes/box-1/messages' && method === 'GET') {
      result = { items: [{ mailbox_message_id: 'item-1', message_id: 'message-1', from_address: 'ruth@example.test', from_name: 'Ruth', subject: 'Shift update', body_text: 'Please review the rota.', snippet: 'Please review the rota.', origin: 'inbound', received_at: '2026-11-04T09:00:00Z', is_read: false, is_starred: false }] };
    } else if (path === '/api/v1/mail/messages/item-1' && method === 'GET') {
      result = { mailbox_message_id: 'item-1', message_id: 'message-1', from_address: 'ruth@example.test', from_name: 'Ruth', subject: 'Shift update', body_text: 'Please review the rota.', body_html: '<p><strong>Please review</strong> the rota.</p><table><tbody><tr><td>Tuesday</td><td>08:00</td></tr></tbody></table>', origin: 'inbound', is_read: true, is_starred: false, recipients: [{ kind: 'to', address: 'amina@nest.test' }], attachments: [], render_notes: {}, has_remote_images: false };
    } else if (path === '/api/v1/mail/drafts' && method === 'POST') {
      result = { id: 'nurse-draft-1', status: 'draft', attachments: [] };
    } else if (path === '/api/v1/mail/drafts/nurse-draft-1' && method === 'PUT') {
      result = { id: 'nurse-draft-1', status: 'draft' };
    } else if (path === '/api/v1/mail/drafts/nurse-draft-1/send' && method === 'POST') {
      result = { status: 'queued' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  }).then(() => sent);
}

test('nurse mail reads sanitized rich content and queues an offline rich draft for reconnect', async ({ page, context }) => {
  await installMockApi(page);
  const sent = await installMailRoutes(page);
  await loginAsDemoNurse(page);
  await page.goto('/mail');
  await expect(page.getByRole('heading', { name: 'Mail' })).toBeVisible();
  await page.getByRole('button', { name: /Shift update/ }).click();
  await expect(page.getByText('Please review', { exact: false }).first()).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Compose' }).click();
  const sheet = page.getByRole('dialog', { name: 'Compose' });
  await sheet.getByLabel('To').fill('supervisor@example.test');
  await sheet.getByLabel('Subject').fill('Offline care update');
  const editor = sheet.locator('[contenteditable="true"][role="textbox"]');
  await expect(editor).toBeVisible();
  await editor.fill('Saved securely while offline.');
  await sheet.getByRole('button', { name: 'Send' }).click();
  // A single-recipient message without attachments sends straight away; no review popup.
  await expect(page.getByText('Waiting to send', { exact: true })).toBeVisible();
  expect(sent.some((item) => item.path.endsWith('/send'))).toBe(false);

  await context.setOffline(false);
  await expect.poll(() => sent.some((item) => item.path === '/api/v1/mail/drafts/nurse-draft-1/send')).toBeTruthy();
});
