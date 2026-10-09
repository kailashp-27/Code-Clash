import Editor, { loader, type EditorProps } from '@monaco-editor/react';
loader.config({ paths: { vs: new URL(`${import.meta.env.BASE_URL}monaco/vs`, window.location.origin).href } });
export default function LocalCodeEditor(props: EditorProps) {
  return <Editor {...props} beforeMount={monaco => {
    monaco.editor.defineTheme('codeclash-arena', {
      base: 'vs-dark', inherit: true, rules: [], colors: {
        'editor.background': '#0c1422', 'editor.lineHighlightBackground': '#142237',
        'editorLineNumber.foreground': '#506580', 'editorLineNumber.activeForeground': '#89c9db',
        'editor.selectionBackground': '#254964', 'editorCursor.foreground': '#67f0ff',
      },
    });
    props.beforeMount?.(monaco);
  }} options={{ editContext: false, ...props.options }} />;
}
