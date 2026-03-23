import * as React from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import styles from "./rich-text-viewer.module.css";

// ─── State Loader Plugin ─────────────────────────────────────────────────────

interface StateLoaderProps {
  serializedState: string;
}

function StateLoaderPlugin({ serializedState }: StateLoaderProps) {
  const [editor] = useLexicalComposerContext();
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (loaded.current || !serializedState) return;
    try {
      const parsed = JSON.parse(serializedState);
      const editorState = editor.parseEditorState(parsed);
      editor.setEditorState(editorState);
      loaded.current = true;
    } catch {
      // Malformed JSON — leave the editor empty
    }
  }, [editor, serializedState]);

  return null;
}

// ─── Public Component ────────────────────────────────────────────────────────

export interface RichTextViewerProps {
  /**
   * Serialized Lexical editor state JSON string.
   * Changing `viewerKey` forces a full remount so new content is shown.
   */
  serializedState: string;
  /**
   * Unique key per content unit (e.g. card ID).
   * When this changes, the Lexical composer remounts and loads the new state.
   */
  viewerKey?: string | number;
  className?: string;
}

function makeViewerConfig(key: string) {
  return {
    namespace: `CourseSummaryViewer-${key}`,
    editable: false,
    theme: {
      text: {
        bold: styles.textBold,
        italic: styles.textItalic,
        underline: styles.textUnderline,
        strikethrough: styles.textStrikethrough,
        underlineStrikethrough: styles.textUnderlineStrikethrough,
      },
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode],
    onError(error: Error) {
      console.error("Lexical viewer error:", error);
    },
  };
}

export function RichTextViewer({
  serializedState,
  viewerKey = "default",
  className,
}: RichTextViewerProps) {
  const config = React.useMemo(() => makeViewerConfig(String(viewerKey)), [viewerKey]);

  return (
    <div className={[styles.viewer, className].filter(Boolean).join(" ")}>
      <LexicalComposer key={viewerKey} initialConfig={config}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className={styles.content}
              aria-readonly
              aria-label="card content"
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        {serializedState && <StateLoaderPlugin serializedState={serializedState} />}
      </LexicalComposer>
    </div>
  );
}
