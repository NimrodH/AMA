import { Button } from "../button/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

export default function CardExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>This is the card content area where you can place any content.</CardContent>
      <CardFooter>
        <Button variant="secondary">Cancel</Button>
        <Button>Continue</Button>
      </CardFooter>
    </Card>
  );
}
