import { Button } from "../button/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

export default function SheetExample() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Open sheet</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Your Cart</SheetTitle>
          <SheetDescription>Review your selected items before checkout.</SheetDescription>
        </SheetHeader>
        <div>
          <p>Classic Tee × 1 — $24.00</p>
          <p>Canvas Tote × 1 — $18.00</p>
          <p>Shipping — $5.00</p>
          <p>Total — $47.00</p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Continue Shopping</Button>
          </SheetClose>
          <Button>Checkout</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
