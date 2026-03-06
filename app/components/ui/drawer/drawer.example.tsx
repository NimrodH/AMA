import { Button } from "../button/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";

export default function DrawerExample() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary">Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Invite Team Members</DrawerTitle>
          <DrawerDescription>
            Send invitations to collaborate on your project. They'll receive an email with a link to join your
            workspace.
          </DrawerDescription>
        </DrawerHeader>
        <p>Enter email addresses of people you'd like to invite to your team.</p>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
          <Button>Send Invites</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
