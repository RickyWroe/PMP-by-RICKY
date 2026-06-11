# PM Partner terminal greeter.
#
# Sourced from ~/.zshrc (installed by `pmp shell install`). When a new shell
# opens inside a PM-Partner-managed project — which is exactly what IDE
# terminals do — or when you `cd` into one, it prints the project recap so you
# are never lost about where the project stands.
#
# Greets once per project per shell, so it never spams.

_pmp_greet() {
  command -v pmp >/dev/null 2>&1 || return 0
  local dir=$PWD
  # Walk upward so subdirectories of the project greet too.
  while [[ "$dir" != "/" && -n "$dir" ]]; do
    if [[ -f "$dir/.pmpartner/project.json" ]]; then
      if [[ "$_PMP_GREETED" != "$dir" ]]; then
        export _PMP_GREETED="$dir"
        (cd "$dir" && pmp recap)
      fi
      return 0
    fi
    dir=${dir:h}
  done
}

# Greet on directory change (cd into a managed project)…
if autoload -Uz add-zsh-hook 2>/dev/null; then
  add-zsh-hook chpwd _pmp_greet
fi

# …and on shell startup (IDE terminal opening at the project root).
_pmp_greet
