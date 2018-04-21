#!/bin/bash
###-begin-lerna-completion-###
#
# lerna command completion script
#
# Installation: lerna completion >> ~/.bashrc  (or ~/.zshrc)
# Or, maybe: lerna completion > /usr/local/etc/bash_completion.d/lerna
#

if type complete &>/dev/null; then
  _lerna_completion () {
    local words cword
    if type _get_comp_words_by_ref &>/dev/null; then
      _get_comp_words_by_ref -n = -n @ -n : -w words -i cword
    else
      cword="$COMP_CWORD"
      words=("${COMP_WORDS[@]}")
    fi

    local si="$IFS"
    IFS=$'\n' COMPREPLY=($(COMP_CWORD="$cword" \
                           COMP_LINE="$COMP_LINE" \
                           COMP_POINT="$COMP_POINT" \
                           lerna --get-yargs-completions "${words[@]}" \
                           )) || return $?
                           # 2>/dev/null)) || return $?
                           # TODO: restore line above
    IFS="$si"
    if type __ltrim_colon_completions &>/dev/null; then
      __ltrim_colon_completions "${words[cword]}"
    fi
  }
  complete -o default -F _lerna_completion lerna
elif type compdef &>/dev/null; then
  _lerna_completion() {
    local si=$IFS
    compadd -- $(COMP_CWORD=$((CURRENT-1)) \
                 COMP_LINE=$BUFFER \
                 COMP_POINT=0 \
                 lerna --get-yargs-completions "${words[@]}" \
                 2>/dev/null)
    IFS=$si
  }
  compdef _lerna_completion lerna
elif type compctl &>/dev/null; then
  _lerna_completion () {
    local cword line point words si
    read -Ac words
    read -cn cword
    let cword-=1
    read -l line
    read -ln point
    si="$IFS"
    IFS=$'\n' reply=($(COMP_CWORD="$cword" \
                       COMP_LINE="$line" \
                       COMP_POINT="$point" \
                       lerna --get-yargs-completions "${words[@]}" \
                       2>/dev/null)) || return $?
    IFS="$si"
  }
  compctl -K _lerna_completion lerna
fi
###-end-lerna-completion-###
