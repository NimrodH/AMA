import { Section } from "@dazl/component-gallery";
import { toast } from "sonner";
import { Button } from "../button/button";
import { Toaster } from "./sonner";

export default function SonnerExample() {
  const showDefaultToast = () => {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
    toast("Event has been created", {
      description: formatter.format(new Date()),
      action: {
        label: "Undo",
        onClick: () => console.log("Undo"),
      },
    });
  };

  return (
    <Section layout="row">
      <Button variant="secondary" onClick={showDefaultToast}>
        Default Toast
      </Button>
      <Button variant="secondary" onClick={() => toast.success("Changes saved")}>
        Success Toast
      </Button>
      <Button variant="secondary" onClick={() => toast.error("Something went wrong")}>
        Error Toast
      </Button>
      <Button variant="secondary" onClick={() => toast.warning("Be careful with this action")}>
        Warning Toast
      </Button>
      <Button variant="secondary" onClick={() => toast.info("Heads up: a new update is available")}>
        Info Toast
      </Button>
      <Toaster />
    </Section>
  );
}
