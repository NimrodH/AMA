import { Section } from "@dazl/component-gallery";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

export default function ToggleGroupExample() {
  return (
    <>
      <Section layout="row">
        <Section.Title>Single</Section.Title>
        <ToggleGroup type="single" defaultValue="center">
          <ToggleGroupItem value="left">Left</ToggleGroupItem>
          <ToggleGroupItem value="center">Center</ToggleGroupItem>
          <ToggleGroupItem value="right">Right</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section layout="row">
        <Section.Title>Multiple</Section.Title>
        <ToggleGroup type="multiple" defaultValue={["bold"]}>
          <ToggleGroupItem value="bold" aria-label="Bold">
            Bold
          </ToggleGroupItem>
          <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
          <ToggleGroupItem value="underline">Underline</ToggleGroupItem>
        </ToggleGroup>
      </Section>
    </>
  );
}
