import { Section } from "@dazl/component-gallery";
import { Alert, AlertDescription, AlertTitle } from "./alert";

export default function AlertExample({}) {
  return (
    <>
      <Section layout="column">
        <Alert variant="default">
          <AlertTitle>🎉 Welcome to our platform!</AlertTitle>
          <AlertDescription>
            Complete your profile setup to get started. You can add your bio, profile picture, and preferences.
          </AlertDescription>
        </Alert>
      </Section>

      <Section layout="column">
        <Alert variant="destructive">
          <AlertTitle>⚠️ Action Required</AlertTitle>
          <AlertDescription>
            Your subscription expires in 3 days. Renew now to avoid service interruption.
          </AlertDescription>
        </Alert>
      </Section>
    </>
  );
}
