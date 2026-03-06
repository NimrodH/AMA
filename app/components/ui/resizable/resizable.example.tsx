import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable";

export default function ResizableExample() {
  return (
    <ResizablePanelGroup orientation="horizontal" style={{ border: "1px solid var(--color-neutral-6)" }}>
      <ResizablePanel defaultSize={30} minSize={20}>
        <div style={{ padding: 16 }}>Left panel</div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={70} minSize={20}>
        <div style={{ padding: 16 }}>Right panel</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
