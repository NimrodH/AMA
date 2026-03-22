import * as React from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { type EditorState, $getSelection, $isRangeSelection, SELECTION_CHANGE_COMMAND, COMMAND_PRIORITY_LOW } from "lexical";
import {
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from "lexical";
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
} from "@lexical/list";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo,
  Redo,
} from "lucide-react";
import styles from "./rich-text-editor.module.css";

// ─── Toolbar ────────────────────────────────────────────────────────────────

interface FormatState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
}

function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [formatState, setFormatState] = React.useState<FormatState>({
    isBold: false,
    isItalic: false,
    isUnderline: false,
  });

  const updateFormatState = React.useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setFormatState({
        isBold: selection.hasFormat("bold"),
        isItalic: selection.hasFormat("italic"),
        isUnderline: selection.hasFormat("underline"),
      });
    }
  }, []);

  React.useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateFormatState();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, updateFormatState]);

  // Also update on editor state changes (e.g. typing)
  React.useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateFormatState();
      });
    });
  }, [editor, updateFormatState]);

  function formatBold() {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
  }
  function formatItalic() {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
  }
  function formatUnderline() {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
  }
  function insertBulletList() {
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  }
  function insertNumberedList() {
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  }
  function undo() {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  }
  function redo() {
    editor.dispatchCommand(REDO_COMMAND, undefined);
  }

  function btnClass(active: boolean) {
    return [styles.toolbarBtn, active ? styles.toolbarBtnActive : ""].filter(Boolean).join(" ");
  }

  return (
    <div className={styles.toolbar} dir="ltr">
      <button type="button" className={styles.toolbarBtn} onClick={undo} title="Undo">
        <Undo size={16} />
      </button>
      <button type="button" className={styles.toolbarBtn} onClick={redo} title="Redo">
        <Redo size={16} />
      </button>
      <div className={styles.toolbarDivider} />
      <button type="button" className={btnClass(formatState.isBold)} onClick={formatBold} title="Bold">
        <Bold size={16} />
      </button>
      <button type="button" className={btnClass(formatState.isItalic)} onClick={formatItalic} title="Italic">
        <Italic size={16} />
      </button>
      <button type="button" className={btnClass(formatState.isUnderline)} onClick={formatUnderline} title="Underline">
        <Underline size={16} />
      </button>
      <div className={styles.toolbarDivider} />
      <button type="button" className={styles.toolbarBtn} onClick={insertBulletList} title="Bullet list">
        <List size={16} />
      </button>
      <button type="button" className={styles.toolbarBtn} onClick={insertNumberedList} title="Numbered list">
        <ListOrdered size={16} />
      </button>
    </div>
  );
}

// ─── Initial State Loader ────────────────────────────────────────────────────

interface InitialStatePluginProps {
  serializedState: string;
}

function InitialStatePlugin({ serializedState }: InitialStatePluginProps) {
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
      // invalid serialized state — leave editor empty
    }
  }, [editor, serializedState]);

  return null;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  /** Serialized Lexical editor state JSON string. */
  initialValue?: string;
  /** Called whenever the editor state changes. */
  onChange?: (serialized: string) => void;
  placeholder?: string;
  className?: string;
  /**
   * Changing this key forces the LexicalComposer to remount, which resets
   * the editor state and loads the new initialValue. Pass the edited record's
   * ID (or any unique value per content) so switching cards works correctly.
   */
  composerKey?: string | number;
}

function makeEditorConfig(key: string) {
  return {
    namespace: `CourseSummaryEditor-${key}`,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode],
    onError(error: Error) {
      console.error("Lexical editor error:", error);
    },
  };
}

export function RichTextEditor({
  initialValue = "",
  onChange,
  placeholder = "כתוב את הסיכום שלך כאן...",
  className,
  composerKey = "default",
}: RichTextEditorProps) {
  // Memoize config so it only rebuilds when the key changes (card switch)
  const editorConfig = React.useMemo(() => makeEditorConfig(String(composerKey)), [composerKey]);

  function handleChange(editorState: EditorState) {
    if (!onChange) return;
    editorState.read(() => {
      const serialized = JSON.stringify(editorState.toJSON());
      onChange(serialized);
    });
  }

  return (
    <div className={[styles.editorWrapper, className].filter(Boolean).join(" ")}>
      <LexicalComposer key={composerKey} initialConfig={editorConfig}>
        <ToolbarPlugin />
        <div className={styles.editorContainer}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable className={styles.editorContent} aria-label="editor" />
            }
            placeholder={
              <div className={styles.editorPlaceholder}>{placeholder}</div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <OnChangePlugin onChange={handleChange} />
          {initialValue && <InitialStatePlugin serializedState={initialValue} />}
        </div>
      </LexicalComposer>
    </div>
  );
}
