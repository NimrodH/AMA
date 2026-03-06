import { Section } from "@dazl/component-gallery";
import { Bold, Italic, Underline, Star } from "lucide-react";
import { Toggle } from "./toggle";

export default function ToggleExample() {
  return (
    <>
      <Section layout="row">
        <Section.Title>Default</Section.Title>
        <Toggle defaultPressed>
          <Bold size={16} />
        </Toggle>
        <Toggle>
          <Italic size={16} />
        </Toggle>
        <Toggle>
          <Underline size={16} />
        </Toggle>
      </Section>

      <Section layout="row">
        <Section.Title>Outline</Section.Title>
        <Toggle variant="outline" defaultPressed>
          <Bold size={16} />
        </Toggle>
        <Toggle variant="outline">
          <Italic size={16} />
        </Toggle>
        <Toggle variant="outline">
          <Underline size={16} />
        </Toggle>
      </Section>

      <Section layout="row">
        <Section.Title>Sizes</Section.Title>
        <Toggle size="sm">
          <Star size={16} />
        </Toggle>
        <Toggle size="default">
          <Star size={16} />
        </Toggle>
        <Toggle size="lg">
          <Star size={16} />
        </Toggle>
      </Section>
    </>
  );
}
