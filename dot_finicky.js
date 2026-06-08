export default {
  defaultBrowser: {
    name: "Google Chrome",
    profile: "Work"
  },
  rewrite: [
    {
      // Redirect all x.com urls to use xcancel.com
      match: "x.com/*",
      url: (url) => {
        url.host = "xcancel.com";
        return url;
      },
    },
  ],
  handlers: [
    {
      // Any depth under `.localhost`: catches both legacy `<project>.localhost`
      // and the runn dev-stack form `<project>.runn.localhost` (3rd-level
      // wildcard so mkcert can issue a browser-trusted cert).
      match: /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost:\d+(\/.*)?$/,
      browser: (url) => ({
        name: "Google Chrome",
        profile: "Dev"
      })
    },
    {
      match: [
        "x.com/*",
        "xcancel.com/*"
      ],
      browser: (url) => ({
        name: "Google Chrome",
        profile: "Personal"
      })
    }
  ]
};