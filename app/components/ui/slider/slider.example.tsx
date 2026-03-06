import { Section } from "@dazl/component-gallery";
import { Slider } from "./slider";

export default function SliderExample() {
  return (
    <>
      <Section layout="column">
        <Section.Title>Default</Section.Title>
        <Slider defaultValue={[50]} max={100} step={1} aria-label="Default slider" />
      </Section>
      <Section layout="column">
        <Section.Title>Range</Section.Title>
        <Slider defaultValue={[25, 75]} max={100} step={1} aria-label="Range slider" />
      </Section>

      <Section layout="column">
        <Section.Title>Disabled</Section.Title>
        <Slider defaultValue={[40]} disabled aria-label="Disabled slider" />
      </Section>
    </>
  );
}
