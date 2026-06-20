return {
  -- Show hidden files in neo-tree
  {
    "nvim-neo-tree/neo-tree.nvim",
    opts = function(_, opts)
      opts.filesystem = opts.filesystem or {}
      opts.filesystem.filtered_items = opts.filesystem.filtered_items or {}
      opts.filesystem.filtered_items.visible = true
      opts.filesystem.filtered_items.show_hidden_count = true
      opts.filesystem.filtered_items.hide_dotfiles = false
      opts.filesystem.filtered_items.hide_gitignored = false
      opts.filesystem.filtered_items.hide_by_name = opts.filesystem.filtered_items.hide_by_name or {}
      opts.filesystem.filtered_items.never_show = opts.filesystem.filtered_items.never_show or {}
    end,
  },

  -- Show hidden and ignored files in Snacks picker/explorer (<leader>ff, <leader>e)
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          files = {
            hidden = true,
            ignored = true,
          },
          explorer = {
            hidden = true,
            ignored = true,
          },
        },
      },
    },
  },

  -- Show hidden files in Telescope find_files
  {
    "nvim-telescope/telescope.nvim",
    opts = function(_, opts)
      opts.pickers = opts.pickers or {}
      opts.pickers.find_files = opts.pickers.find_files or {}
      opts.pickers.find_files.hidden = true
      opts.pickers.find_files.find_command = { "rg", "--files", "--hidden", "--glob", "!.git" }
    end,
  },
}
