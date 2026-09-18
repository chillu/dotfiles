export OP_PLUGIN_ALIASES_SOURCED=1
# gh is authenticated via keyring (gh auth login), not a configured 1Password
# plugin (no gh.json here). Routing it through `op plugin run` only breaks it
# when the desktop-app integration is down. Re-add via `op plugin init gh` if
# you ever store the gh token in 1Password.
# alias gh="op plugin run -- gh"
