return {
  "nvim-neo-tree/neo-tree.nvim",
  opts = {
    filesystem = {
      filtered_items = {
        visible = true,
        hide_dotfiles = false,
        hide_gitignored = false,
      },
    },
    window = {
      mappings = {
        ["P"] = { "toggle_preview", config = { use_float = true } },
      },
    },
  },
}
