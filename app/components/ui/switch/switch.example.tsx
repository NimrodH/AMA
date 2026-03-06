import { Label } from "~/components/ui/label/label";
import { Section } from "@dazl/component-gallery";
import { Switch } from "./switch";

export default function SwitchExample() {
  return (
    <Section layout="row">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Switch id="switch-off" />
        <Label htmlFor="switch-off">Off</Label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Switch id="switch-on" defaultChecked />
        <Label htmlFor="switch-on">On</Label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Switch id="switch-disabled" disabled />
        <Label htmlFor="switch-disabled">Disabled</Label>
      </div>
    </Section>
  );
}
