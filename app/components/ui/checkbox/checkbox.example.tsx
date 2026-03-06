import { Label } from "~/components/ui/label/label";
import { Section } from "@dazl/component-gallery";
import { Checkbox } from "./checkbox";

export default function CheckboxExample() {
  return (
    <Section layout="row">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox id="unchecked" />
        <Label htmlFor="unchecked">Unchecked</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox id="checked" defaultChecked />
        <Label htmlFor="checked">Checked</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox id="disabled" disabled />
        <Label htmlFor="disabled">Disabled</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Checkbox id="disabled-checked" disabled defaultChecked />
        <Label htmlFor="disabled-checked">Disabled Checked</Label>
      </div>
    </Section>
  );
}
