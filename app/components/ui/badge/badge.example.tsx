import { Section } from "@dazl/component-gallery";
import { Badge } from "./badge";

export default function BadgeExample() {
  return (
    <Section layout="row">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </Section>
  );
}
