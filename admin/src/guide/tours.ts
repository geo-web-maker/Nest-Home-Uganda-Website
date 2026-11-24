import type { Tour } from './guide';

const nav = (p: string) => `aside nav a[href="${p}"]`;
const is = (p: string) => (x: string) => (p === '/' ? x === '/' : x === p || x.startsWith(`${p}/`));
const t = (key: string, path: string, steps: Tour['steps'], match = is(path)): Tour => ({ key, version: 1, path, match, steps });
/** Admin-app tours. The full tour only visits pages the signed-in user can see (filtered in AdminLayout). */
export const ADMIN_TOURS: Tour[] = [
  t('dashboard', '/', [
    { title: 'Welcome to Admin', body: 'Manage the website, care operations and safety from one place. This short tour shows where things are.' },
    { anchor: 'aside nav', title: 'Navigation', body: 'Everything you are allowed to use is listed here, grouped by area.' },
    { anchor: 'main', title: 'Dashboard', body: 'Today\u2019s key numbers and what needs attention.' },
    { anchor: '[data-guide="help"]', title: 'Need this again?', body: 'Tap ? any time to replay tips for a page or take the full tour.' },
  ]),
  t('enquiries', '/enquiries', [{ anchor: nav('/enquiries'), title: 'Enquiries', body: 'Messages from the website contact forms. Open one to reply or mark it handled.' }]),
  t('clients', '/care/clients', [
    { anchor: nav('/care/clients'), title: 'Clients', body: 'Everyone receiving care. Open a client for details, places and visit history.' },
    { anchor: 'main', title: 'Search and filter', body: 'Use the filter bar above the table to find a client quickly.' },
  ]),
  t('nurses', '/care/nurses', [{ anchor: nav('/care/nurses'), title: 'Nurses', body: 'Field staff and their supervisors. Open a nurse to update their profile.' }]),
  t('visits', '/care/visits', [{ anchor: nav('/care/visits'), title: 'Visits', body: 'All scheduled and completed visits with their status.' }]),
  t('schedule', '/care/schedule', [{ anchor: nav('/care/schedule'), title: 'Schedule', body: 'Plan visits and assign nurses. Nurses see changes in their app.' }]),
  t('alerts', '/care/alerts', [{ anchor: nav('/care/alerts'), title: 'Alerts', body: 'Late, missed or unusual visits that need follow-up.' }]),
  t('sos', '/care/sos', [{ anchor: nav('/care/sos'), title: 'SOS', body: 'Live safety alerts from nurses. Acknowledge and act on these first.' }]),
  t('users', '/users', [
    { anchor: nav('/users'), title: 'Users', body: 'Invite staff, set access, reset passwords and sign people out.' },
    { anchor: 'main', title: 'Show a user the tour', body: 'Use \u201cShow app tour\u201d on a user so they see the guided tour the next time they open their app.' },
  ]),
  t('mail', '/mail', [{ anchor: nav('/mail'), title: 'Mail', body: 'Your mailbox and shared addresses.' }]),
  t('settings', '/settings', [{ anchor: nav('/settings'), title: 'Settings', body: 'Website and care settings. Changes apply to everyone, so check before saving.' }]),
  t('app-center', '/app-center', [{ anchor: 'main', title: 'App updates', body: 'Check for a newer app version and install it here.' }]),
];
