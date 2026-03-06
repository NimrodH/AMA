import { Section } from "@dazl/component-gallery";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

export default function SelectExample() {
  return (
    <Section layout="row">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any status</SelectItem>
          <SelectSeparator />

          <SelectGroup>
            <SelectLabel>Open</SelectLabel>
            <SelectItem value="backlog">Backlog</SelectItem>
            <SelectItem value="in-progress">In progress</SelectItem>
          </SelectGroup>

          <SelectSeparator />

          <SelectGroup>
            <SelectLabel>Closed</SelectLabel>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Disabled select" />
        </SelectTrigger>
      </Select>
    </Section>
  );
}
