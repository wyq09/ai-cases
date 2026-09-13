;/* ==== icons.js ==== */
(function () {
  const P = {
    logo: '<path d="M6 15v-4M10 17V7m4 10v-6m4 6V10" stroke-width="2.4"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4"/>',
    moon: '<path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z"/>',
    dashboard: '<rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="3.3"/>',
    robot: '<rect x="5" y="8.5" width="14" height="10" rx="3"/><path d="M12 8.5V5.6m0 0h.01M9.5 5.6h5"/><path d="M9.3 13.2h.01M14.7 13.2h.01" stroke-width="2.6"/><path d="M9.8 16h4.4"/>',
    dollar: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2v9.6M14.6 9.1c-.5-.8-1.4-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2 0 2.7 5.2 1.4 5.2 4.1 0 1.2-1.1 2-2.6 2-1.2 0-2.1-.5-2.6-1.3"/>',
    wrench: '<path d="M14.7 6.3a3.8 3.8 0 0 0-5 5L4.5 16.5a1.9 1.9 0 0 0 2.7 2.7l5.2-5.2a3.8 3.8 0 0 0 5-5L14.6 11l-1.6-1.6 1.7-3.1Z"/>',
    plug: '<path d="M9 3.5V8m6-4.5V8M7 8h10v3.2A5 5 0 0 1 12 16a5 5 0 0 1-5-4.8V8Zm5 8v4.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 4.2 13 6a6.3 6.3 0 0 1 2.1.9l2-.6 1.6 2.8-1.4 1.5a6.5 6.5 0 0 1 0 2.4l1.4 1.5-1.6 2.8-2-.6a6.3 6.3 0 0 1-2.1.9l-1 2.2h-3.2l-1-2.2a6.3 6.3 0 0 1-2.1-.9l-2 .6-1.6-2.8 1.4-1.5a6.5 6.5 0 0 1 0-2.4L4 8.3l1.6-2.8 2 .6A6.3 6.3 0 0 1 9.7 5l1-2.2Z" stroke-width="1.4"/>',
    help: '<circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2-2.4 3.4"/><path d="M12 16.6h.01" stroke-width="2.6"/>',
    logout: '<path d="M13.5 4.5H7A1.8 1.8 0 0 0 5.2 6.3v11.4A1.8 1.8 0 0 0 7 19.5h6.5M15.5 8.2 19.3 12l-3.8 3.8M19 12H9.8"/>',
    search: '<circle cx="11" cy="11" r="6.4"/><path d="m19.5 19.5-3.8-3.8"/>',
    bell: '<path d="M17.7 10.4a5.7 5.7 0 1 0-11.4 0c0 4.2-1.7 5.6-1.7 5.6h14.8s-1.7-1.4-1.7-5.6Z"/><path d="M10.2 19.2a2 2 0 0 0 3.6 0"/>',
    calendar: '<rect x="4.2" y="5.4" width="15.6" height="14.4" rx="2.4"/><path d="M8 3.4v3.4m8-3.4v3.4M4.6 10h14.8"/>',
    'chevron-down': '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    'chevron-right': '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
    'arrow-up-right': '<path d="M7 17 17 7M9.5 7H17v7.5"/>',
    'arrow-right': '<path d="M4.5 12h15m0 0-5.5-5.5M19.5 12 14 17.5"/>',
    'arrow-left': '<path d="M19.5 12h-15m0 0L10 6.5M4.5 12 10 17.5"/>',
    back: '<path d="M9.5 7.5 4 12l5.5 4.5M4.5 12H15a4.8 4.8 0 0 1 0 9.6h-2" transform="translate(0 -2)"/>',
    send: '<path d="m5 12 14-6.5L15.5 19l-3.4-5.2L5 12Z"/><path d="m12.1 13.8 6.9-8.3"/>',
    attach: '<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.8 1.8 0 0 1-2.5-2.5l7.7-7.7"/>',
    image: '<rect x="4" y="4.5" width="16" height="15" rx="3"/><circle cx="9.2" cy="9.8" r="1.6"/><path d="m5.5 17.5 4.4-4.2c.7-.7 1.8-.6 2.5 0l5.9 5.4"/>',
    mic: '<rect x="9.2" y="3.5" width="5.6" height="10.4" rx="2.8"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3"/>',
    doc: '<path d="M13.5 3.5H7.6A1.9 1.9 0 0 0 5.7 5.4v13.2a1.9 1.9 0 0 0 1.9 1.9h8.8a1.9 1.9 0 0 0 1.9-1.9V8.3l-4.8-4.8Z"/><path d="M13.7 3.7V8h4.4M9 12.4h6m-6 3.4h6"/>',
    bookmark: '<path d="M7 4.5h10a.9.9 0 0 1 .9.9V20l-5.9-3.6L6.1 20V5.4a.9.9 0 0 1 .9-.9Z"/>',
    download: '<path d="M12 4.5v10m0 0 4-4m-4 4-4-4M5 19.5h14"/>',
    check: '<path d="m5.5 12.5 4.5 4.5 8.5-9.5"/>',
    x: '<path d="m6.5 6.5 11 11m0-11-11 11"/>',
    plus: '<path d="M12 5.5v13M5.5 12h13"/>',
    filter: '<path d="M5 5.5h14l-5.4 6.4v5.4l-3.2 1.7v-7.1L5 5.5Z"/>',
    spark: '<path d="M12 4.5 13.8 10 19.5 12l-5.7 2L12 19.5 10.2 14 4.5 12l5.7-2L12 4.5Z"/>',
    shield: '<path d="M12 4 5.5 6.4v5.2c0 4.2 2.8 6.9 6.5 8.4 3.7-1.5 6.5-4.2 6.5-8.4V6.4L12 4Z"/>',
    person: '<circle cx="12" cy="8.6" r="3.4"/><path d="M5.5 19.4a6.7 6.7 0 0 1 13 0"/>',
    warning: '<path d="M12 4.8 3.8 18.6a1.2 1.2 0 0 0 1 1.8h14.4a1.2 1.2 0 0 0 1-1.8L12 4.8Z"/><path d="M12 10v4m0 3h.01" stroke-width="2.2"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 2"/>',
    bolt: '<path d="M13 3.5 5.5 13.5h5l-1 7L17 10.5h-5l1-7Z"/>',
    code: '<path d="m8.5 8-4.5 4 4.5 4m7-8 4.5 4-4.5 4"/>',
    braces: '<path d="M9 4.5c-2 0-2.7 1-2.7 2.5v2.6c0 1.4-.7 2.4-2.3 2.4 1.6 0 2.3 1 2.3 2.4v2.6c0 1.5.7 2.5 2.7 2.5M15 4.5c2 0 2.7 1 2.7 2.5v2.6c0 1.4.7 2.4 2.3 2.4-1.6 0-2.3 1-2.3 2.4v2.6c0 1.5-.7 2.5-2.7 2.5"/>',
    git: '<circle cx="7" cy="6.5" r="2.3"/><circle cx="7" cy="17.5" r="2.3"/><circle cx="17" cy="9" r="2.3"/><path d="M7 8.8v6.4M17 11.3c0 3-2.5 3.6-5.5 3.9-1.7.2-3 .7-3.4 1.6"/>',
    gauge: '<path d="M5 17.5a8.4 8.4 0 1 1 14 0"/><path d="m12 14 3.8-4.4"/><circle cx="12" cy="14.4" r="1.4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5.5 14.5h-.6A1.9 1.9 0 0 1 3 12.6V5a1.9 1.9 0 0 1 1.9-1.9h7.6a1.9 1.9 0 0 1 1.9 1.9v.6"/>',
    eye: '<path d="M4 12s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    play: '<path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.6-6.2c.6-.4.6-1.4 0-1.8L9.6 4.9c-.7-.4-1.6.1-1.6.9Z"/>',
    pause: '<path d="M9 5.5v13M15 5.5v13"/>',
    refresh: '<path d="M19 12a7 7 0 1 1-2-4.9M19 4.5V8h-3.5"/>',
    external: '<path d="M13.5 5.5H19V11M19 5.5l-8 8M10 6H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3"/>',
    zap: '<path d="M13 3.5 5.5 13.5h5l-1 7L17 10.5h-5l1-7Z"/>',
    layers: '<path d="m12 4 8.4 4.4L12 12.8 3.6 8.4 12 4Z"/><path d="m4.5 12.6 7.5 4 7.5-4M4.5 16.6l7.5 4 7.5-4" stroke-width="1.4"/>',
    activity: '<path d="M3.5 12h4l2.5-6 4 12 2.5-6h4"/>',
    target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1" stroke-width="2"/>',
    settings2: '<path d="M5 8h9m3 0h2M5 16h2m3 0h9"/><circle cx="15.5" cy="8" r="2"/><circle cx="8.5" cy="16" r="2"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.4"/><path d="m4.5 7.5 7.5 5.6 7.5-5.6"/>',
    database: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  };
  const cache = {};
  window.__ICON_LIB = {
    names: Object.keys(P),
    icon(name, size = 18, sw) {
      const d = P[name] || P.spark;
      const k = name + size + sw;
      if (!cache[k]) cache[k] =
        `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.6}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
      return cache[k];
    },
    has: (n) => !!P[n],
  };
})();
