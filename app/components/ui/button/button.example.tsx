import { Section } from "@dazl/component-gallery";
import { Button } from "./button";

export default function ButtonExample() {
  return (
    <>
      <Section layout="row">
        <Button variant="default">Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="link">Link</Button>
      </Section>

      <Section layout="row">
        <Section.Title>Small Buttons</Section.Title>
        <Button size="sm" variant="default">
          Default
        </Button>
        <Button size="sm" variant="secondary">
          Secondary
        </Button>
        <Button size="sm" variant="destructive">
          Destructive
        </Button>
        <Button size="sm" variant="outline">
          Outline
        </Button>
        <Button size="sm" variant="link">
          Link
        </Button>
      </Section>

      <Section layout="row">
        <Section.Title>Large Buttons</Section.Title>
        <Button size="lg" variant="default">
          Default
        </Button>
        <Button size="lg" variant="secondary">
          Secondary
        </Button>
        <Button size="lg" variant="destructive">
          Destructive
        </Button>
        <Button size="lg" variant="outline">
          Outline
        </Button>
        <Button size="lg" variant="link">
          Link
        </Button>
      </Section>

      <Section layout="row">
        <Section.Title>Disabled Buttons</Section.Title>
        <Button disabled>Disabled</Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
        <Button variant="destructive" disabled>
          Disabled
        </Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
        <Button variant="link" disabled>
          Disabled
        </Button>
      </Section>
    </>
  );
}
