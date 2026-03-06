import { Section } from "@dazl/component-gallery";
import { Input } from "./input";

export default function InputExample() {
  return (
    <Section layout="column">
      <Input defaultValue="Input with text" />
      <Input placeholder="Input with placeholder" />
      <Input placeholder="Disabled input" disabled />
      <Input defaultValue="Read-only input" readOnly />
    </Section>
  );
}
