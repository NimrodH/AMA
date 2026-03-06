import { Section } from "@dazl/component-gallery";
import { ColorSchemeToggle } from "./color-scheme-toggle";

export default function ColorSchemeToggleExample() {
  return (
    <>
      <Section layout="row">
        <Section.Title>Icon With Text</Section.Title>
        <ColorSchemeToggle triggerText={true} optionText={true} />
      </Section>
      <Section layout="row">
        <Section.Title>Icon Only</Section.Title>
        <ColorSchemeToggle triggerText={false} optionText={false} />
      </Section>
    </>
  );
}
