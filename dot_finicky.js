export default {
  defaultBrowser: {
    name: "Google Chrome",
    // "Work" profile. Using args (--profile-directory) instead of the `profile`
    // key avoids Finicky v4's `-n` flag, which forces a slow new-instance launch.
    args: ["--profile-directory=Profile 1"]
  },
  handlers: [
    {
      // Any depth under `.localhost`: catches both legacy `<project>.localhost`
      // and the runn dev-stack form `<project>.runn.localhost` (3rd-level
      // wildcard so mkcert can issue a browser-trusted cert).
      match: /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.localhost:\d+(\/.*)?$/,
      // "Dev" profile
      browser: () => ({ name: "Google Chrome", args: ["--profile-directory=Profile 2"] })
    },
    {
      match: [
        "x.com/*",
        "xcancel.com/*"
      ],
      // "Personal" profile
      browser: () => ({ name: "Google Chrome", args: ["--profile-directory=Default"] })
    }
  ]
};
