import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

export default function AccordionExample() {
  return (
    <Accordion type="single" collapsible defaultValue="item-3">
      <AccordionItem value="item-1">
        <AccordionTrigger>How long does shipping take?</AccordionTrigger>
        <AccordionContent>
          Standard shipping typically takes 3-5 business days. Express shipping options are available at checkout for
          delivery within 1-2 business days.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-2">
        <AccordionTrigger>What is your return policy?</AccordionTrigger>
        <AccordionContent>
          We accept returns within 30 days of purchase. Items must be unused and in their original packaging. Simply
          contact our support team to initiate a return.
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="item-3">
        <AccordionTrigger>What payment methods do you accept?</AccordionTrigger>
        <AccordionContent>
          We accept all major credit cards, PayPal, Apple Pay, and Google Pay. All transactions are secured with
          industry-standard encryption.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
