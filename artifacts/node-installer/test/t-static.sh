# Tests that need no fake system: syntax, cleanliness of the file, the manifest, the validators.

t_syntax_sh_n() {
    sh -n "$INSTALLER" || fail "sh -n found a syntax error"
}

t_syntax_dash_n() {
    command -v dash >/dev/null 2>&1 || skip "dash is not installed"
    dash -n "$INSTALLER" || fail "dash -n found a syntax error"
}

t_syntax_posix_tools() {
    # Shell scripts of the suite itself.
    for _f in "$HERE"/*.sh; do
        sh -n "$_f" || fail "sh -n found a syntax error in ${_f#"$REPO"/}"
    done
}

# CI runs the tool as a step of its own; here it only has to agree when it is installed.
t_shellcheck_error_level() {
    [ -n "$REAL_SHELLCHECK" ] || skip "shellcheck is not installed"
    "$REAL_SHELLCHECK" -s sh -S error "$INSTALLER" >"$T/out" 2>&1 || fail "shellcheck found an error"
}

t_file_is_clean() {
    _cr=$(printf '\r')
    ! grep -q "$_cr" "$INSTALLER" || fail "install.sh has a carriage return"
    [ "$(head -n 1 "$INSTALLER")" = '#!/bin/sh' ] || fail "install.sh must start with #!/bin/sh"
    # Cyrillic letters are UTF-8 sequences starting with the bytes D0 or D1.
    ! LC_ALL=C grep -q "$(printf '[\320\321]')" "$INSTALLER" || fail "install.sh contains Cyrillic text: the messages are English only"
    # Only documentation address ranges, private ranges and the constants of the installer may appear as IPv4 addresses.
    _bad=$(grep -Eo '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' "$INSTALLER" | sort -u \
        | grep -Ev '^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|127\.0\.0\.1$|0\.0\.0\.0$)' || true)
    [ -z "$_bad" ] || fail "install.sh has an IPv4 address outside the documentation ranges: $_bad"
    # No e-mail addresses, no instance names.
    ! grep -Eq '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}' "$INSTALLER" || fail "install.sh contains an e-mail address"
    # Instance names are the business of scripts/check-hygiene.py (its forbidden patterns are not in the repository).
    ! grep -Eiq "owner's|BEGIN [A-Z ]*PRIVATE KEY" "$INSTALLER" || fail "install.sh talks about someone's decision or holds a key"
}

t_every_path_goes_through_the_root() {
    # A file under /etc, /opt, /var or /home is written as $R/... in a command; the exceptions are text inside configuration files.
    _bad=$(grep -nE '(>>?|\bmkdir -p|\bchmod [0-9]+|\bcp |\brm -f|\bwrite_file|\binstall -m) *"?/(etc|opt|var|home|usr/share)/' "$INSTALLER" | grep -v '^[0-9]*:[[:space:]]*#' || true)
    [ -z "$_bad" ] || fail "a path without \$R in a command: $_bad"
}

t_help_version_demo_need_no_root() {
    # No fake root and no stubs: the real system, without root, changes nothing.
    for _a in help version demo; do
        env -i PATH="$ORIG_PATH" ${SYSTEMROOT:+"SYSTEMROOT=$SYSTEMROOT"} HOME="$T" NO_COLOR=1 "$SHELL_UNDER_TEST" "$INSTALLER" "$_a" >"$T/out.$_a" 2>"$T/err" </dev/null
        RC=$?
        assert_rc 0
    done
    grep -q '^Swellwright node installer [0-9]' "$T/out.version" || fail "version prints no version"
    grep -q 'Usage:' "$T/out.help" || fail "help prints no usage"
    grep -q 'nothing is changed' "$T/out.demo" || fail "demo does not say that nothing is changed"
}

t_version_matches_manifest() {
    _v=$(sed -n 's/^INSTALLER_VERSION=//p' "$INSTALLER")
    _m=$(sed -n 's/^ *"version": "\(.*\)",$/\1/p' "$HERE/../manifest.json" | head -n1)
    [ "$_v" = "$_m" ] || fail "INSTALLER_VERSION $_v differs from the manifest $_m"
    env -i PATH="$ORIG_PATH" "$SHELL_UNDER_TEST" "$INSTALLER" version >"$T/out" 2>&1
    grep -qF "$_v" "$T/out" || fail "version prints something else than $_v"
}

t_manifest_is_current() {
    [ -n "$REAL_NODE" ] || skip "node is not installed"
    ( cd "$REPO" && "$REAL_NODE" scripts/artifact-manifest.mjs --check ) >"$T/out" 2>&1 || fail "the manifest or the README tables are out of date"
}

t_manifest_hash_matches_file() {
    _sum=$(sha256sum "$INSTALLER" | cut -d' ' -f1)
    grep -qF "\"sha256\": \"$_sum\"" "$HERE/../manifest.json" || fail "the sha256 of install.sh is not the one in manifest.json"
    _size=$(wc -c <"$INSTALLER" | tr -d ' ')
    grep -qF "\"size\": $_size," "$HERE/../manifest.json" || fail "the size of install.sh is not the one in manifest.json"
}

# Every row of validators.tsv: accept|NAME|value or reject|NAME|value, optionally a fourth column y/n: does the
# published pattern of the manifest match (default: accept means yes, reject means no; a validator can be stricter than its pattern).
t_validators_table() {
    [ -n "$REAL_NODE" ] || skip "node is not installed (needed to read the patterns of the manifest)"
    "$REAL_NODE" -e '
      const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      for (const [n, p] of Object.entries(m.params)) if (p.pattern) console.log(n + "\t" + p.pattern);
    ' "$HERE/../manifest.json" >"$T/patterns.tsv" || fail "could not read the patterns of the manifest"
    in_inst "
        TAB=\$(printf '\\t')
        while IFS=\$TAB read -r _n _p; do eval \"PAT_\$_n=\\\$_p\"; done <'$T/patterns.tsv'
        _bad=0
        while IFS='|' read -r _e _n _v _m; do
            case \$_e in ''|'#'*) continue ;; esac
            if param_valid \"\$_n\" \"\$_v\"; then _got=accept; else _got=reject; fi
            [ \"\$_got\" = \"\$_e\" ] || { echo \"validator: \$_n '\$_v': expected \$_e, got \$_got\"; _bad=1; }
            eval \"_pat=\\\${PAT_\$_n:-}\"
            if [ -n \"\$_pat\" ]; then
                [ -n \"\$_m\" ] || { if [ \"\$_e\" = accept ]; then _m=y; else _m=n; fi; }
                if printf '%s\\n' \"\$_v\" | LC_ALL=C grep -Eq \"\$_pat\"; then _pm=y; else _pm=n; fi
                [ \"\$_pm\" = \"\$_m\" ] || { echo \"pattern of \$_n: '\$_v': expected match=\$_m, got \$_pm\"; _bad=1; }
            fi
        done <'$HERE/validators.tsv'
        exit \$_bad
    "
    [ "$RC" -eq 0 ] || fail "validator table: $(cat "$T/out" "$T/err" | head -n 8 | tr '\n' ';')"
}

t_validators_refuse_line_breaks() {
    in_inst '
        NLX=$(printf "\nx")
        _bad=0
        for _c in "NODE_DOMAIN node1.example.com$NLX" "NODE_IP 192.0.2.10$NLX" "NODE_PORT 443$NLX" "PANEL_ALLOW_IP 192.0.2.20$NLX" "NEW_USER admin$NLX" "CERTSYNC_PUBKEY ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEXAMPLEEXAMPLE$NLX" "NODE_IMAGE_TAG 3.4.6$NLX" "SECRET_KEY ABCDEFGHIJKLMNOPQRSTUVWX$NLX"; do
            _n=${_c%% *}; _v=${_c#* }
            param_valid "$_n" "$_v" && { echo "accepted a line break: $_n"; _bad=1; }
        done
        _v=$(printf "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEXAMPLEEXAMPLE\nssh-rsa AAAAAAAAAAAAAAAAAAAAAAAAAAAA")
        param_valid CERTSYNC_PUBKEY "$_v" && { echo "accepted two keys"; _bad=1; }
        _v="node1.example.com
evil.example.com"
        param_valid NODE_DOMAIN "$_v" && { echo "accepted two domains on two lines"; _bad=1; }
        exit $_bad
    '
    [ "$RC" -eq 0 ] || fail "a value with a line break was accepted: $(cat "$T/out" "$T/err" | head -n 5 | tr '\n' ';')"
}

t_every_param_has_a_validator_and_a_hint() {
    in_inst '
        _bad=0
        for _n in $PARAM_NAMES SW_NONINTERACTIVE SW_VERBOSE SW_ASCII; do
            h=$(param_hint "$_n")
            [ "$h" != "a known parameter" ] || { echo "no hint: $_n"; _bad=1; }
        done
        exit $_bad
    '
    [ "$RC" -eq 0 ] || fail "$(cat "$T/out" "$T/err" | tr '\n' ';')"
}
