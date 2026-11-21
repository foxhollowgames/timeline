/* Wayfinder optional analytics. No Google request is made before an affirmative choice. */
(() => {
  'use strict';
  if (window.wayfinderAnalytics) return;
  const id = 'G-DB54M9BCZM';
  const key = 'wayfinder.analytics-consent.v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const production = ['wayfinder.josephnewelldesign.com', 'foxhollowgames.github.io'].includes(location.hostname);
  const verification = new URLSearchParams(location.search).get('analytics_debug') === '1';
  const collectionMode = 'enabled'; // 'enabled', 'verification', or 'paused'.
  const eligible = production && collectionMode !== 'paused' && (collectionMode === 'enabled' || verification) && (!navigator.webdriver || verification);
  let loaded = false;
  let choice = readChoice();
  window['ga-disable-' + id] = choice !== 'accepted' || !eligible;

  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return saved && saved.expires > Date.now() && ['accepted', 'declined'].includes(saved.value) ? saved.value : null;
    } catch { return null; }
  }
  function clearCookies() {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; domain=' + location.hostname]) {
        document.cookie = name + '=; Max-Age=0; path=/' + domain + '; SameSite=Lax';
      }
    }
  }
  function start() {
    if (loaded || choice !== 'accepted' || !eligible) return;
    loaded = true;
    window['ga-disable-' + id] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const gtag = window.gtag;
    // Basic consent mode: the Google library only exists after consent.
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    gtag('set', 'ads_data_redaction', true);
    const sections = { bible: 'Bible', 'book-of-mormon': 'Book of Mormon', 'doctrine-and-covenants': 'Doctrine and Covenants', timeline: 'Timeline' };
    const section = location.pathname.split('/')[1];
    const path = Object.hasOwn(sections, section) ? '/' + section + '/' : '/';
    // Never use document.title, full location, referrer, searches, or chapter state.
    const config = {
      send_page_view: false,
      page_location: location.origin + path,
      page_referrer: '',
      page_title: 'Wayfinder' + (sections[section] ? ' | ' + sections[section] : ''),
      ignore_referrer: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: location.hostname,
      cookie_path: '/',
      cookie_expires: 60 * 24 * 60 * 60,
      cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure'
    };
    if (verification) Object.assign(config, { debug_mode: true, traffic_type: 'verification' });
    // Apply privacy settings globally BEFORE any Google bootstrap can initialize a destination.
    gtag('set', config);
    gtag('js', new Date());
    gtag('config', id, config);
    gtag('event', 'page_view', { send_to: id, page_location: config.page_location, page_referrer: '', page_title: config.page_title, ...(verification ? { debug_mode: true, traffic_type: 'verification' } : {}) });
    const script = document.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.append(script);
  }
  function save(value) {
    choice = value;
    try { localStorage.setItem(key, JSON.stringify({ value, expires: Date.now() + lifetime })); } catch { /* A choice still applies to this page if storage is unavailable. */ }
    if (value === 'declined') {
      window['ga-disable-' + id] = true;
      clearCookies();
      if (loaded) { location.reload(); return; }
    } else start();
    show(false, true);
  }
  const style = document.createElement('style');
  style.textContent = `
    #wf-analytics-settings,#wf-analytics-panel{font:14px/1.5 system-ui,sans-serif;color:#142b3b;background:#fff;border:1px solid #647580;border-radius:6px;box-sizing:border-box}
    #wf-analytics-settings{position:fixed;bottom:8px;left:8px;z-index:10000;padding:7px 10px;cursor:pointer;min-height:36px}
    #wf-analytics-settings[hidden]{display:none}
    #wf-analytics-menu-item{display:block;margin-top:12px}
    #wf-analytics-panel{position:fixed;left:12px;bottom:54px;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 76px);overflow:auto;z-index:10001;padding:18px;box-shadow:0 4px 24px #0004}
    #wf-analytics-panel[hidden]{display:none}
    #wf-analytics-panel h2{font:700 18px/1.3 system-ui,sans-serif;margin:0 0 8px;padding-right:40px;color:#142b3b}
    #wf-analytics-panel #wf-analytics-close{position:absolute;top:8px;right:8px;margin:0;width:44px;min-height:44px;padding:0;font:400 24px/1 system-ui,sans-serif;background:transparent;border-color:transparent}
    #wf-analytics-panel #wf-analytics-close:hover{border-color:#647580}
    #wf-analytics-panel p{margin:8px 0}
    #wf-analytics-panel a{color:#174c72;text-decoration:underline}
    #wf-analytics-panel button{font:600 14px/1.4 system-ui,sans-serif;min-height:44px;padding:9px 14px;background:#edf3f6;color:#142b3b;border:1px solid #647580;border-radius:4px;cursor:pointer;margin:8px 8px 0 0}
    #wf-analytics-panel button:focus-visible,#wf-analytics-settings:focus-visible,#wf-analytics-panel a:focus-visible{outline:3px solid #1769a5;outline-offset:3px}
  `;
  document.head.append(style);
  const settings = document.createElement('button');
  settings.id = 'wf-analytics-settings';
  settings.type = 'button';
  settings.textContent = 'Analytics choices';
  settings.setAttribute('aria-controls', 'wf-analytics-panel');
  const panel = document.createElement('section');
  panel.id = 'wf-analytics-panel';
  panel.setAttribute('aria-labelledby', 'wf-analytics-title');
  panel.innerHTML = `<h2 id="wf-analytics-title">Optional analytics</h2><p>With your permission, Wayfinder uses Google Analytics cookies to understand visits to the home page, each volume, and the timeline. Google receives a browser identifier and basic visit information, and processes your IP address to deliver the service.</p><p>We do not send search text, chapters read, URL queries or fragments, or referring page addresses. Advertising features are disabled. Google Analytics may also record basic session and engagement information.</p><p>Your choice is saved in this browser for six months. You can decline and still use everything, or change your choice here at any time. Declining stops future collection; it does not erase data already sent.</p><p><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google privacy policy</a></p>`;
  const accept = document.createElement('button');
  accept.type = 'button'; accept.textContent = 'Accept analytics'; accept.addEventListener('click', () => save('accepted'));
  const decline = document.createElement('button');
  decline.type = 'button'; decline.textContent = 'Decline analytics'; decline.addEventListener('click', () => save('declined'));
  panel.append(accept, decline);
  // A visible way to close the panel without changing the saved choice.
  const close = document.createElement('button');
  close.id = 'wf-analytics-close'; close.type = 'button'; close.textContent = '×';
  close.setAttribute('aria-label', 'Close analytics choices');
  close.addEventListener('click', () => show(false, true));
  panel.prepend(close);
  // After a choice, the shared settings menu holds the control. Pages without that menu keep the floating button.
  const menuPanel = document.querySelector ? document.querySelector('.settings-panel') : null;
  let menuItem = null;
  const menuButton = menuPanel && menuPanel.closest ? menuPanel.closest('.settings-menu')?.querySelector('.settings-button') : null;
  if (menuPanel) {
    menuItem = document.createElement('button');
    menuItem.id = 'wf-analytics-menu-item';
    menuItem.type = 'button';
    menuItem.className = 'source-details-button';
    menuItem.textContent = 'Analytics choices';
    menuItem.setAttribute('aria-controls', 'wf-analytics-panel');
    menuItem.addEventListener('click', () => show(true, true));
    menuPanel.append(menuItem);
  }
  function show(open, moveFocus = false) {
    panel.hidden = !open;
    settings.hidden = choice !== null && menuItem !== null;
    for (const trigger of [settings, menuItem]) if (trigger) trigger.setAttribute('aria-expanded', String(open));
    if (!moveFocus) return;
    if (open) accept.focus();
    else (settings.hidden ? menuButton || menuItem : settings).focus();
  }
  settings.addEventListener('click', () => show(panel.hidden, true));
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') show(false, true); });
  document.body.append(settings, panel);
  show(choice === null);
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    choice = readChoice();
    if (choice !== 'accepted') {
      window['ga-disable-' + id] = true;
      clearCookies();
      if (loaded) location.reload();
    } else start();
    show(choice === null);
  });
  window.wayfinderAnalytics = Object.freeze({ openChoices() { show(true, true); } });
  if (choice !== 'accepted') clearCookies();
  start();
})();
