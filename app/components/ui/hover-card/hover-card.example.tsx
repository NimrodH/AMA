import { Section } from "@dazl/component-gallery";
import { Button } from "../button/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

export default function HoverCardExample() {
  return (
    <Section layout="row">
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="secondary" size="icon">
            ↑
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="top">
          <p>This is a hover card that appears on top.</p>
        </HoverCardContent>
      </HoverCard>

      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="secondary" size="icon">
            →
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="right">
          <p>This is a hover card that appears on the right.</p>
        </HoverCardContent>
      </HoverCard>

      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="secondary" size="icon">
            ↓
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="bottom">
          <p>This is a hover card that appears on the bottom.</p>
        </HoverCardContent>
      </HoverCard>

      <HoverCard>
        <HoverCardTrigger asChild>
          <Button variant="secondary" size="icon">
            ←
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="left">
          <p>This is a hover card that appears on the left.</p>
        </HoverCardContent>
      </HoverCard>
    </Section>
  );
}
