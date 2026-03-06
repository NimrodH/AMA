import { Section } from "@dazl/component-gallery";
import { Progress } from "./progress";

export default function ProgressExample() {
  return (
    <Section layout="column">
      <Progress value={25} />
      <Progress value={50} />
      <Progress value={75} />
    </Section>
  );
}
