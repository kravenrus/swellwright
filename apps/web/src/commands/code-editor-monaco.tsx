// The part of the code editor that needs Monaco: `code-editor.tsx` loads this file lazily. Importing `./monaco-setup.js`
// first makes `@monaco-editor/react` use the Monaco that is bundled here instead of fetching one from a CDN.
import './monaco-setup.js';

import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

import { LoaderModal } from '@swellwright/ui';

export interface MonacoEditorProps {
  value: string;
  language: string;
  theme: string;
  readOnly: boolean;
  onChange: ((value: string) => void) | undefined;
  options: editor.IStandaloneEditorConstructionOptions;
}

export default function MonacoEditor({
  value,
  language,
  theme,
  readOnly,
  onChange,
  options,
}: MonacoEditorProps) {
  return (
    <Editor
      language={language}
      loading={<LoaderModal mih="100%" />}
      onChange={(next) => {
        onChange?.(next ?? '');
      }}
      options={{ ...options, readOnly }}
      theme={theme}
      value={value}
    />
  );
}
