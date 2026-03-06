import { RadioGroup, RadioGroupItem } from "./radio-group";

export default function RadioGroupExample() {
  return (
    <RadioGroup defaultValue="Option 1">
      <RadioGroupItem value="Option 1" />
      <RadioGroupItem value="Option 2" />
      <RadioGroupItem value="Option 3" />
      <RadioGroupItem value="Disabled option" disabled />
    </RadioGroup>
  );
}
