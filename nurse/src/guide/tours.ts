import type { Tour } from './guide';

const nav = (p: string) => `a[href="${p}"]`;
const is = (p: string) => (x: string) => x === p || x.startsWith(`${p}/`);
/** Nurse-app tours. Anchors are existing selectors; a step whose anchor is not on screen shows as a centred card. */
export const NURSE_TOURS: Tour[] = [
  { key: 'today', version: 1, path: '/', match: (x) => x === '/', steps: [
    { title: 'Welcome', body: 'This app is your day at work: visits, notes, photos, hours and messages. It takes a minute to see around.' },
    { anchor: '.mk-summary-card', title: 'Your day at a glance', body: 'See how many visits you have today and how many are done.' },
    { anchor: '.mk-today__list', title: 'Your visits', body: 'Tap a visit to see the client, address and instructions, then arrive and start the visit.' },
    { anchor: '.sos-dock', title: 'Safety button', body: 'If you are in danger, press and hold this button. Your supervisor is alerted with your location.' },
    { title: 'No internet? Keep working', body: 'You can open the app and fill in visit documents without a connection. Everything saves on your phone and sends when you are back online.' },
    { anchor: '[data-guide="help"]', title: 'Need this again?', body: 'Tap ? any time to replay tips for a page or take the full tour.' },
  ] },
  { key: 'visit', version: 1, path: '', match: is('/visit'), steps: [
    { anchor: '.mk-detail-card', title: 'Visit details', body: 'Check the client, address, time and care instructions before you go.' },
    { anchor: '.mk-detail-actions', title: 'Arrive', body: 'When you reach the client, tap here to confirm you have arrived.' },
    { anchor: '.mk-secondary-actions', title: 'More actions', body: 'Add a note or a photo, or get directions from here.' },
  ] },
  { key: 'active', version: 1, path: '', match: is('/active'), steps: [
    { anchor: '.mk-timer-panel', title: 'Visit timer', body: 'Your time on this visit is counted here and used for your timesheet.' },
    { anchor: '.mk-quick-note', title: 'Quick note', body: 'Write what you did and observed. It saves even without internet.' },
    { anchor: '.mk-photo-add', title: 'Photos', body: 'Add photos only where your care rules allow. Follow the guidance shown.' },
    { anchor: '.mk-detail-actions', title: 'Leaving', body: 'When care is finished, tap here to leave and close the visit.' },
  ] },
  { key: 'history', version: 1, path: '/history', match: is('/history'), steps: [
    { anchor: nav('/history'), title: 'History', body: 'Every visit you have finished, newest first.' },
    { anchor: '.mk-history-list', title: 'Open a past visit', body: 'Tap one to review what was recorded.' },
  ] },
  { key: 'timesheets', version: 1, path: '/timesheets', match: is('/timesheets'), steps: [
    { anchor: nav('/timesheets'), title: 'Hours', body: 'Your worked hours are added up from your visits.' },
    { anchor: 'main', title: 'Check before submitting', body: 'If hours look wrong, tell your supervisor before the period closes.' },
  ] },
  { key: 'documents', version: 1, path: '/documents', match: is('/documents'), steps: [
    { anchor: nav('/documents'), title: 'Documents', body: 'Care forms and policies you need are kept here.' },
    { anchor: 'main', title: 'Works offline', body: 'Forms you fill in without internet are saved and sent later.' },
  ] },
  { key: 'mail', version: 1, path: '/mail', match: is('/mail'), steps: [
    { anchor: nav('/mail'), title: 'Messages', body: 'Messages from the office and your supervisor arrive here.' },
    { anchor: 'main', title: 'Reply', body: 'Open a message to read it and reply. Replies send when you are online.' },
  ] },
  { key: 'audit', version: 1, path: '/audit', match: is('/audit'), steps: [
    { anchor: nav('/audit'), title: 'Activity', body: 'A record of what you did in the app, for your own checking.' },
  ] },
  { key: 'profile', version: 1, path: '/profile', match: (x) => x === '/profile', steps: [
    { anchor: nav('/profile'), title: 'Your profile', body: 'Your details, device help and account options are here.' },
    { anchor: 'main', title: 'Sync and updates', body: 'Open Sync to see what is waiting to send, and App Center for updates.' },
  ] },
  { key: 'sync', version: 1, path: '/sync', match: is('/sync'), steps: [
    { anchor: '.mk-sync-overview', title: 'Waiting to send', body: 'Anything saved offline shows here until it reaches the office. Leave the app open with internet to send it.' },
  ] },
  { key: 'app-center', version: 1, path: '/app-center', match: is('/app-center'), steps: [
    { anchor: 'main', title: 'App updates', body: 'Check for a newer version and install it from here.' },
  ] },
];
