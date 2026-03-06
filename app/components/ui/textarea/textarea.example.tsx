import { Section } from "@dazl/component-gallery";
import { Textarea } from "./textarea";

export default function TextareaExample() {
  return (
    <Section layout="column">
      <Textarea defaultValue="Textarea with text" />
      <Textarea placeholder="Textarea with placeholder" />
      <Textarea placeholder="Disabled textarea" disabled />
    </Section>
  );
}
