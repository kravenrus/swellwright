// Adapted from the Remnawave panel frontend 3.4.11 (AGPL-3.0-only): src/shared/constants/monaco-theme/{monaco-theme.tsx,
// monaco-editor-options.ts}. The GitHub-like dark theme of the panel's code editor, name and values unchanged, and the
// options its editors share. Changes: typed against Monaco's theme data, the options live in this file.
import type { editor } from 'monaco-editor';

export const MONACO_THEME_NAME = 'GithubDark';

export const monacoTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    {
      background: '161b22',
      token: '',
    },
    {
      foreground: '8b949e',
      token: 'comment',
    },
    {
      foreground: '54aeff',
      token: 'constant',
    },
    {
      foreground: 'ffb77c',
      token: 'entity',
    },
    {
      foreground: 'fae17d',
      token: 'keyword',
    },
    {
      foreground: 'fae17d',
      token: 'storage',
    },
    {
      foreground: 'aceebb',
      token: 'string',
    },
    {
      foreground: 'aceebb',
      token: 'meta.verbatim',
    },
    {
      foreground: '54aeff',
      token: 'support',
    },
    {
      foreground: 'fb8f44',
      fontStyle: 'italic',
      token: 'invalid.deprecated',
    },
    {
      foreground: 'c9d1d9',
      background: '7d4e00',
      token: 'invalid.illegal',
    },
    {
      foreground: 'ffb77c',
      fontStyle: 'italic',
      token: 'entity.other.inherited-class',
    },
    {
      foreground: 'ffd8b5',
      token: 'string constant.other.placeholder',
    },
    {
      foreground: '80ccff',
      token: 'meta.function-call.py',
    },
    {
      foreground: '6e7681',
      token: 'meta.tag',
    },
    {
      foreground: '6e7681',
      token: 'meta.tag entity',
    },
    {
      foreground: 'b1bac4',
      token: 'entity.name.section',
    },
    {
      foreground: 'b1bac4',
      token: 'keyword.type.variant',
    },
    {
      foreground: 'c9d1d9',
      token: 'source.ocaml keyword.operator.symbol',
    },
    {
      foreground: '54aeff',
      token: 'source.ocaml keyword.operator.symbol.infix',
    },
    {
      foreground: '54aeff',
      token: 'source.ocaml keyword.operator.symbol.prefix',
    },
    {
      fontStyle: 'underline',
      token: 'source.ocaml keyword.operator.symbol.infix.floating-point',
    },
    {
      fontStyle: 'underline',
      token: 'source.ocaml keyword.operator.symbol.prefix.floating-point',
    },
    {
      fontStyle: 'underline',
      token: 'source.ocaml constant.numeric.floating-point',
    },
    {
      background: 'ffffff08',
      token: 'text.tex.latex meta.function.environment',
    },
    {
      background: '218bff10',
      token: 'text.tex.latex meta.function.environment meta.function.environment',
    },
    {
      foreground: 'fae17d',
      token: 'text.tex.latex support.function',
    },
    {
      foreground: 'c9d1d9',
      token: 'source.plist string.unquoted',
    },
    {
      foreground: 'c9d1d9',
      token: 'source.plist keyword.operator',
    },
  ],
  colors: {
    'editor.foreground': '#c9d1d9',
    'editor.background': '#161b22',
    'editor.selectionBackground': '#0969da55',
    'editor.lineHighlightBackground': '#21262d',
    'editorCursor.foreground': '#54aeff',
    'editorWhitespace.foreground': '#484f58',
    'editorLineNumber.foreground': '#6e7681',
    'editorLineNumber.activeForeground': '#c9d1d9',
    'editorWidget.background': '#1c2128',
    'editorWidget.border': '#30363d',
    'editorWidget.foreground': '#c9d1d9',
    'editorHoverWidget.background': '#1c2128',
    'editorHoverWidget.border': '#30363d',
    'editorHoverWidget.foreground': '#c9d1d9',
    'editorSuggestWidget.background': '#1c2128',
    'editorSuggestWidget.border': '#30363d',
    'editorSuggestWidget.foreground': '#c9d1d9',
    'editorSuggestWidget.selectedBackground': '#21262d',
    'editorSuggestWidget.highlightForeground': '#54aeff',

    'menu.background': '#1c2128',
    'menu.foreground': '#c9d1d9',
    'menu.selectionBackground': '#22b8cf29',
    'menu.selectionForeground': '#e6edf3',
    'menu.separatorBackground': '#30363d',
    'menu.border': '#30363d',
  },
};

/** The panel's `BASE_MONACO_OPTIONS`, with the minimap of its compact variant (a script is short). */
export const SCRIPT_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoIndent: 'full',
  automaticLayout: true,
  bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
  detectIndentation: true,
  fixedOverflowWidgets: true,
  folding: true,
  foldingStrategy: 'auto',
  fontSize: 14,
  guides: { bracketPairs: true, indentation: true },
  insertSpaces: true,
  minimap: { enabled: false },
  padding: { top: 10, bottom: 10 },
  stickyScroll: { enabled: false },
  quickSuggestions: false,
  renderLineHighlight: 'all',
  scrollbar: { alwaysConsumeMouseWheel: false, useShadows: false },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  tabSize: 2,
};
