import { Button } from "../button/button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export default function PopoverExample() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p>This is a popover content.</p>
      </PopoverContent>
    </Popover>
  );
}
